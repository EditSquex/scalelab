import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocketPlugin from '@fastify/websocket';
import { broker } from './broker.js';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Fastify instance
// ---------------------------------------------------------------------------
const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

// ---------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------
await fastify.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
});

await fastify.register(websocketPlugin, {
  options: { maxPayload: 1048576 }, // 1MB max WebSocket message
});

// ---------------------------------------------------------------------------
// Pre-create default topics for demos
// ---------------------------------------------------------------------------
broker.createTopic('notifications', 500);
broker.createTopic('events', 1000);
broker.createTopic('logs', 2000);
broker.createTopic('alerts', 200);

// ---------------------------------------------------------------------------
// Topic Routes
// ---------------------------------------------------------------------------

/** POST /api/topics — Create a new topic */
fastify.post('/api/topics', {
  schema: {
    body: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 100 },
        maxMessages: { type: 'number', minimum: 1, maximum: 100000 },
      },
    },
  },
}, async (request, reply) => {
  const { name, maxMessages = 1000 } = request.body;
  const result = broker.createTopic(name, maxMessages);
  return reply.status(result.created ? 201 : 200).send(result);
});

/** GET /api/topics — List all topics with stats */
fastify.get('/api/topics', async (request, reply) => {
  return reply.send({ topics: broker.getTopics(), count: broker.getTopics().length });
});

/** GET /api/topics/:name — Get a specific topic's details */
fastify.get('/api/topics/:name', async (request, reply) => {
  const topic = broker.getTopic(request.params.name);
  if (!topic) return reply.status(404).send({ error: 'Topic not found' });
  return reply.send(topic);
});

/** DELETE /api/topics/:name — Delete a topic */
fastify.delete('/api/topics/:name', async (request, reply) => {
  const deleted = broker.deleteTopic(request.params.name);
  if (!deleted) return reply.status(404).send({ error: 'Topic not found' });
  return reply.send({ deleted: true, name: request.params.name });
});

// ---------------------------------------------------------------------------
// Publish / Consume Routes
// ---------------------------------------------------------------------------

/** POST /api/publish — Publish a message to a topic */
fastify.post('/api/publish', {
  schema: {
    body: {
      type: 'object',
      required: ['topic', 'message'],
      properties: {
        topic: { type: 'string' },
        message: {},
      },
    },
  },
}, async (request, reply) => {
  const { topic, message } = request.body;
  const result = broker.publish(topic, message);
  return reply.status(201).send(result);
});

/** POST /api/consume — Pull next message for a consumer group */
fastify.post('/api/consume', {
  schema: {
    body: {
      type: 'object',
      required: ['topic', 'groupId'],
      properties: {
        topic: { type: 'string' },
        groupId: { type: 'string' },
      },
    },
  },
}, async (request, reply) => {
  const { topic, groupId } = request.body;
  const message = broker.consume(topic, groupId);

  if (!message) {
    return reply.send({ message: null, lag: 0, status: 'no-messages' });
  }

  const topicInfo = broker.getTopic(topic);
  const lag = topicInfo?.consumerGroups?.[groupId]?.lag ?? 0;

  return reply.send({ message, lag, status: 'ok' });
});

// ---------------------------------------------------------------------------
// ACK / NACK Routes
// ---------------------------------------------------------------------------

/** POST /api/acknowledge — Mark a message as successfully processed */
fastify.post('/api/acknowledge', {
  schema: {
    body: {
      type: 'object',
      required: ['topic', 'groupId', 'messageId'],
      properties: {
        topic: { type: 'string' },
        groupId: { type: 'string' },
        messageId: { type: 'string' },
      },
    },
  },
}, async (request, reply) => {
  const { topic, groupId, messageId } = request.body;
  const result = broker.acknowledge(topic, groupId, messageId);
  return reply.send(result);
});

/** POST /api/nack — Report failed processing; may send to DLQ */
fastify.post('/api/nack', {
  schema: {
    body: {
      type: 'object',
      required: ['topic', 'groupId', 'messageId'],
      properties: {
        topic: { type: 'string' },
        groupId: { type: 'string' },
        messageId: { type: 'string' },
      },
    },
  },
}, async (request, reply) => {
  const { topic, groupId, messageId } = request.body;
  const result = broker.nack(topic, groupId, messageId);
  return reply.send(result);
});

// ---------------------------------------------------------------------------
// DLQ Routes
// ---------------------------------------------------------------------------

/** GET /api/dlq — Inspect the Dead Letter Queue */
fastify.get('/api/dlq', async (request, reply) => {
  const dlq = broker.getDLQ();
  return reply.send({ messages: dlq, count: dlq.length });
});

/** POST /api/dlq/replay — Move all DLQ messages back to their original topics */
fastify.post('/api/dlq/replay', async (request, reply) => {
  const result = broker.replayDLQ();
  return reply.send(result);
});

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/** GET /api/stats — Broker-wide statistics */
fastify.get('/api/stats', async (request, reply) => {
  return reply.send(broker.getStats());
});

// ---------------------------------------------------------------------------
// WebSocket — Real-time push subscription
//
// Connect: ws://localhost:3005/ws/subscribe?topic=notifications&group=dashboard
// The server streams new messages to the WebSocket as they are published.
// ---------------------------------------------------------------------------
fastify.get('/ws/subscribe', { websocket: true }, (socket, request) => {
  const { topic, group } = request.query;

  if (!topic || !group) {
    socket.send(JSON.stringify({ error: 'topic and group query params are required' }));
    socket.close();
    return;
  }

  const consumerId = randomUUID();
  fastify.log.info(`[WS] Consumer ${consumerId} subscribed to topic=${topic} group=${group}`);

  // Send welcome acknowledgment
  socket.send(JSON.stringify({
    type: 'subscribed',
    consumerId,
    topic,
    group,
    timestamp: new Date().toISOString(),
  }));

  // Register push handler — called whenever a message is published
  const { backlogDelivered } = broker.subscribe(topic, group, consumerId, (message) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify({ type: 'message', ...message }));
    }
  });

  if (backlogDelivered > 0) {
    socket.send(JSON.stringify({
      type: 'backlog-complete',
      delivered: backlogDelivered,
      timestamp: new Date().toISOString(),
    }));
  }

  // Handle client-sent messages (ACK, NACK commands over WS)
  socket.on('message', (raw) => {
    try {
      const cmd = JSON.parse(raw.toString());
      if (cmd.type === 'ack' && cmd.messageId) {
        broker.acknowledge(topic, group, cmd.messageId);
        socket.send(JSON.stringify({ type: 'ack-confirmed', messageId: cmd.messageId }));
      } else if (cmd.type === 'nack' && cmd.messageId) {
        const result = broker.nack(topic, group, cmd.messageId);
        socket.send(JSON.stringify({ type: 'nack-result', messageId: cmd.messageId, ...result }));
      }
    } catch {
      // Ignore malformed commands
    }
  });

  socket.on('close', () => {
    broker.unsubscribe(topic, group, consumerId);
    fastify.log.info(`[WS] Consumer ${consumerId} disconnected from ${topic}/${group}`);
  });

  socket.on('error', (err) => {
    fastify.log.error(`[WS] Consumer ${consumerId} error:`, err.message);
    broker.unsubscribe(topic, group, consumerId);
  });
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
fastify.get('/health', async (request, reply) => {
  return reply.send({
    status: 'ok',
    service: 'pub-sub',
    timestamp: new Date().toISOString(),
    topics: broker.getTopics().length,
    stats: broker.getStats(),
  });
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT) || 3005;
const HOST = process.env.HOST || '0.0.0.0';

try {
  await fastify.listen({ port: PORT, host: HOST });
  fastify.log.info(`[Pub/Sub] Listening on http://${HOST}:${PORT}`);
  fastify.log.info(`[Pub/Sub] WebSocket endpoint: ws://${HOST}:${PORT}/ws/subscribe`);
} catch (err) {
  fastify.log.error(err, 'Failed to start Pub/Sub service');
  process.exit(1);
}
