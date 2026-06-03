import { randomUUID } from 'crypto';

/**
 * In-memory Pub/Sub Message Broker
 *
 * Implements a simplified Kafka-like pub/sub system with:
 * - Topics with configurable max message retention
 * - Consumer groups with independent offsets (each group reads all messages)
 * - Round-robin delivery within consumer groups for competing consumers
 * - Acknowledgement (ACK) and negative acknowledgement (NACK) with retries
 * - Dead Letter Queue (DLQ) for messages exceeding max retry attempts
 * - Push-based subscriptions (via WebSocket handlers)
 * - Pull-based consumption (via REST API)
 */
class MessageBroker {
  constructor() {
    /**
     * topics: Map<topicName, {
     *   name: string,
     *   maxMessages: number,
     *   messages: Array<Message>,
     *   createdAt: Date,
     *   consumerGroups: Map<groupId, ConsumerGroup>
     * }>
     */
    this.topics = new Map();

    /**
     * offsets: Map<`${topicName}:${groupId}`, number>
     * Each group tracks its read position independently.
     */
    this.offsets = new Map();

    /**
     * Dead Letter Queue — messages that failed MAX_ATTEMPTS times
     */
    this.dlq = [];

    /** Broker-wide metrics */
    this.stats = {
      published: 0,
      consumed: 0,
      acknowledged: 0,
      failed: 0,
      dlqCount: 0,
    };

    /** Maximum retry attempts before sending to DLQ */
    this.MAX_ATTEMPTS = 3;
  }

  // ---------------------------------------------------------------------------
  // Topic Management
  // ---------------------------------------------------------------------------

  /**
   * Create a new topic. Idempotent — does nothing if topic already exists.
   * @param {string} name - Topic name
   * @param {number} maxMessages - Max messages to retain (default: 1000)
   * @returns {{ created: boolean, topic: object }}
   */
  createTopic(name, maxMessages = 1000) {
    if (this.topics.has(name)) {
      return { created: false, topic: this._topicSummary(name) };
    }

    this.topics.set(name, {
      name,
      maxMessages,
      messages: [],
      createdAt: new Date().toISOString(),
      consumerGroups: new Map(),
    });

    return { created: true, topic: this._topicSummary(name) };
  }

  /**
   * Delete a topic and all its messages/group state.
   * @param {string} name
   * @returns {boolean} true if topic existed
   */
  deleteTopic(name) {
    if (!this.topics.has(name)) return false;
    this.topics.delete(name);

    // Clean up all offset entries for this topic
    for (const key of this.offsets.keys()) {
      if (key.startsWith(`${name}:`)) {
        this.offsets.delete(key);
      }
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Publishing
  // ---------------------------------------------------------------------------

  /**
   * Publish a message to a topic.
   * Auto-creates topic if it doesn't exist.
   * Delivers the message to all push-subscribed WebSocket consumers.
   *
   * @param {string} topicName
   * @param {*} payload - The message payload (any JSON-serialisable value)
   * @returns {{ messageId: string, offset: number, topic: string }}
   */
  publish(topicName, payload) {
    if (!this.topics.has(topicName)) {
      this.createTopic(topicName);
    }

    const topic = this.topics.get(topicName);
    const messageId = randomUUID();
    const offset = topic.messages.length;

    const message = {
      id: messageId,
      topic: topicName,
      payload,
      offset,
      timestamp: new Date().toISOString(),
      attempts: 0,
    };

    topic.messages.push(message);
    this.stats.published++;

    // Enforce retention limit — evict oldest messages
    if (topic.messages.length > topic.maxMessages) {
      const excess = topic.messages.length - topic.maxMessages;
      topic.messages.splice(0, excess);

      // Adjust offsets for all consumer groups so they don't go negative
      for (const [key, offset] of this.offsets.entries()) {
        if (key.startsWith(`${topicName}:`)) {
          this.offsets.set(key, Math.max(0, offset - excess));
        }
      }
    }

    // Notify push-subscribed consumers via their registered handlers
    for (const [groupId, group] of topic.consumerGroups.entries()) {
      if (group.handlers && group.handlers.size > 0) {
        // Round-robin delivery within the group
        const handlers = Array.from(group.handlers.values());
        const targetHandler = handlers[offset % handlers.length];
        try {
          targetHandler(message);
        } catch (err) {
          console.error(`[Broker] Push delivery failed for group ${groupId}:`, err.message);
        }
      }
    }

    return { messageId, offset, topic: topicName };
  }

  // ---------------------------------------------------------------------------
  // Subscribing (push-based, for WebSocket)
  // ---------------------------------------------------------------------------

  /**
   * Register a push-based consumer within a consumer group.
   * The handler will be called on every new published message.
   * Also delivers any unread backlog from the current group offset.
   *
   * @param {string} topicName
   * @param {string} groupId
   * @param {string} consumerId
   * @param {function} handler - Called with each Message
   * @returns {{ subscribed: boolean, backlogDelivered: number }}
   */
  subscribe(topicName, groupId, consumerId, handler) {
    if (!this.topics.has(topicName)) {
      this.createTopic(topicName);
    }

    const topic = this.topics.get(topicName);

    if (!topic.consumerGroups.has(groupId)) {
      topic.consumerGroups.set(groupId, { handlers: new Map() });
    }

    const group = topic.consumerGroups.get(groupId);
    group.handlers.set(consumerId, handler);

    // Deliver backlog from current offset
    const offsetKey = `${topicName}:${groupId}`;
    const currentOffset = this.offsets.get(offsetKey) || 0;
    const backlog = topic.messages.slice(currentOffset);

    let delivered = 0;
    for (const msg of backlog) {
      try {
        handler(msg);
        delivered++;
      } catch (err) {
        console.error('[Broker] Backlog delivery error:', err.message);
      }
    }

    this.offsets.set(offsetKey, topic.messages.length);

    return { subscribed: true, backlogDelivered: delivered };
  }

  /**
   * Unregister a push consumer.
   */
  unsubscribe(topicName, groupId, consumerId) {
    const topic = this.topics.get(topicName);
    if (!topic) return false;
    const group = topic.consumerGroups.get(groupId);
    if (!group) return false;
    group.handlers.delete(consumerId);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Pull-based Consumption
  // ---------------------------------------------------------------------------

  /**
   * Pull the next unread message for a consumer group.
   * Increments the group's offset on success.
   *
   * @param {string} topicName
   * @param {string} groupId
   * @returns {Message|null}
   */
  consume(topicName, groupId) {
    if (!this.topics.has(topicName)) return null;
    const topic = this.topics.get(topicName);

    // Ensure group is registered
    if (!topic.consumerGroups.has(groupId)) {
      topic.consumerGroups.set(groupId, { handlers: new Map() });
    }

    const offsetKey = `${topicName}:${groupId}`;
    const currentOffset = this.offsets.get(offsetKey) || 0;

    if (currentOffset >= topic.messages.length) {
      return null; // No new messages
    }

    const message = topic.messages[currentOffset];
    this.offsets.set(offsetKey, currentOffset + 1);
    this.stats.consumed++;

    return message;
  }

  // ---------------------------------------------------------------------------
  // Acknowledgement
  // ---------------------------------------------------------------------------

  /**
   * Acknowledge successful processing of a message.
   * (In this simplified model, ACK just records the stat.)
   */
  acknowledge(topicName, groupId, messageId) {
    this.stats.acknowledged++;
    return { acknowledged: true, messageId };
  }

  /**
   * Negative acknowledge — message processing failed.
   * Increments attempt counter. If attempts >= MAX_ATTEMPTS, moves to DLQ.
   *
   * @param {string} topicName
   * @param {string} groupId
   * @param {string} messageId
   * @returns {{ requeued: boolean, movedToDLQ: boolean, attempts: number }}
   */
  nack(topicName, groupId, messageId) {
    if (!this.topics.has(topicName)) {
      return { requeued: false, movedToDLQ: false, attempts: 0 };
    }

    const topic = this.topics.get(topicName);
    const message = topic.messages.find((m) => m.id === messageId);

    if (!message) {
      return { requeued: false, movedToDLQ: false, attempts: 0 };
    }

    message.attempts = (message.attempts || 0) + 1;
    this.stats.failed++;

    if (message.attempts >= this.MAX_ATTEMPTS) {
      // Move to Dead Letter Queue
      this.dlq.push({
        ...message,
        dlqReason: `Failed after ${message.attempts} attempts`,
        dlqTimestamp: new Date().toISOString(),
        originalTopic: topicName,
        groupId,
      });
      this.stats.dlqCount++;

      // Remove from topic
      const idx = topic.messages.indexOf(message);
      if (idx !== -1) topic.messages.splice(idx, 1);

      return { requeued: false, movedToDLQ: true, attempts: message.attempts };
    }

    // Requeue by resetting this group's offset back to include this message
    const offsetKey = `${topicName}:${groupId}`;
    const currentOffset = this.offsets.get(offsetKey) || 0;
    this.offsets.set(offsetKey, Math.max(0, currentOffset - 1));

    return { requeued: true, movedToDLQ: false, attempts: message.attempts };
  }

  // ---------------------------------------------------------------------------
  // DLQ Management
  // ---------------------------------------------------------------------------

  getDLQ() {
    return this.dlq;
  }

  /**
   * Replay all DLQ messages back to their original topics.
   * Resets their attempt counter so they can be processed fresh.
   */
  replayDLQ() {
    const replayed = [];

    for (const dlqMessage of this.dlq) {
      const { originalTopic, dlqReason, dlqTimestamp, groupId, ...message } = dlqMessage;
      message.attempts = 0;

      if (!this.topics.has(originalTopic)) {
        this.createTopic(originalTopic);
      }

      const topic = this.topics.get(originalTopic);
      topic.messages.push(message);
      this.stats.published++;

      replayed.push({ messageId: message.id, topic: originalTopic });
    }

    this.dlq = [];
    return { replayed: replayed.length, messages: replayed };
  }

  // ---------------------------------------------------------------------------
  // Introspection
  // ---------------------------------------------------------------------------

  getTopics() {
    return Array.from(this.topics.keys()).map((name) => this._topicSummary(name));
  }

  getTopic(name) {
    if (!this.topics.has(name)) return null;
    return this._topicSummary(name);
  }

  getStats() {
    return {
      ...this.stats,
      topicCount: this.topics.size,
      dlqSize: this.dlq.length,
      timestamp: new Date().toISOString(),
    };
  }

  /** @private */
  _topicSummary(name) {
    const topic = this.topics.get(name);
    if (!topic) return null;

    const groupSummaries = {};
    for (const [groupId, group] of topic.consumerGroups.entries()) {
      const offsetKey = `${name}:${groupId}`;
      const offset = this.offsets.get(offsetKey) || 0;
      const lag = topic.messages.length - offset;
      groupSummaries[groupId] = {
        offset,
        lag,
        activeConsumers: group.handlers ? group.handlers.size : 0,
      };
    }

    return {
      name: topic.name,
      messageCount: topic.messages.length,
      maxMessages: topic.maxMessages,
      createdAt: topic.createdAt,
      consumerGroups: groupSummaries,
      consumerGroupCount: topic.consumerGroups.size,
    };
  }
}

// Export a singleton broker instance
export const broker = new MessageBroker();
