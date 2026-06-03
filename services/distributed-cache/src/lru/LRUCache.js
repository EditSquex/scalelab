/**
 * LRU (Least Recently Used) Cache
 *
 * Implemented using a doubly-linked list + a Map for O(1) get and put.
 * The head of the list = Most Recently Used.
 * The tail of the list = Least Recently Used (eviction candidate).
 */

class LRUNode {
  constructor(key, value) {
    this.key = key;
    this.value = value;
    this.prev = null;
    this.next = null;
  }
}

export class LRUCache {
  constructor(capacity = 50) {
    this.capacity = capacity;
    this.map = new Map(); // key → LRUNode

    // Sentinel head and tail nodes — simplify edge cases
    this.head = new LRUNode(null, null); // MRU end
    this.tail = new LRUNode(null, null); // LRU end
    this.head.next = this.tail;
    this.tail.prev = this.head;

    // Analytics
    this.hits = 0;
    this.misses = 0;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Remove a node from its current position in the list */
  _remove(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }

  /** Insert a node immediately after the head (MRU position) */
  _insertAtFront(node) {
    node.next = this.head.next;
    node.prev = this.head;
    this.head.next.prev = node;
    this.head.next = node;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Retrieve a value by key.
   * Moves the accessed node to the MRU position.
   * @param {string} key
   * @returns {*} The stored value, or -1 if not found / expired
   */
  get(key) {
    if (!this.map.has(key)) {
      this.misses++;
      return -1;
    }

    const node = this.map.get(key);

    // Check TTL if set
    if (node.expiresAt && Date.now() > node.expiresAt) {
      this._remove(node);
      this.map.delete(key);
      this.misses++;
      return -1;
    }

    // Move to front (most recently used)
    this._remove(node);
    this._insertAtFront(node);

    this.hits++;
    return node.value;
  }

  /**
   * Store a key-value pair.
   * If the key exists, update the value and move to MRU.
   * If over capacity, evict the LRU entry (tail).
   * @param {string} key
   * @param {*} value
   * @param {number} [ttlMs] - Optional TTL in milliseconds
   */
  put(key, value, ttlMs) {
    if (this.map.has(key)) {
      const node = this.map.get(key);
      node.value = value;
      node.expiresAt = ttlMs ? Date.now() + ttlMs : null;
      this._remove(node);
      this._insertAtFront(node);
      return;
    }

    // Evict LRU if at capacity
    if (this.map.size >= this.capacity) {
      const lruNode = this.tail.prev;
      this._remove(lruNode);
      this.map.delete(lruNode.key);
    }

    const newNode = new LRUNode(key, value);
    newNode.expiresAt = ttlMs ? Date.now() + ttlMs : null;
    this.map.set(key, newNode);
    this._insertAtFront(newNode);
  }

  /**
   * Delete a key from the cache.
   * @param {string} key
   * @returns {boolean} true if the key existed
   */
  delete(key) {
    if (!this.map.has(key)) return false;
    const node = this.map.get(key);
    this._remove(node);
    this.map.delete(key);
    return true;
  }

  /**
   * Returns cache statistics including hit rate.
   * @returns {{ size: number, capacity: number, hitRate: number, hits: number, misses: number }}
   */
  getStats() {
    const total = this.hits + this.misses;
    return {
      size: this.map.size,
      capacity: this.capacity,
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? 0 : parseFloat((this.hits / total).toFixed(4)),
    };
  }

  /**
   * Returns all cache entries in MRU → LRU order.
   * @returns {Array<{ key: string, value: *, expiresAt: number|null }>}
   */
  toArray() {
    const entries = [];
    let current = this.head.next;
    while (current !== this.tail) {
      entries.push({
        key: current.key,
        value: current.value,
        expiresAt: current.expiresAt
          ? new Date(current.expiresAt).toISOString()
          : null,
      });
      current = current.next;
    }
    return entries;
  }

  /** Clear all entries and reset stats */
  clear() {
    this.map.clear();
    this.head.next = this.tail;
    this.tail.prev = this.head;
    this.hits = 0;
    this.misses = 0;
  }
}
