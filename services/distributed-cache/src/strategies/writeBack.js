/**
 * Write-Back (Write-Behind) Cache Strategy
 *
 * Pattern:
 *   WRITE: App writes to cache only → returns immediately (low latency).
 *          DB write is deferred and batched in the background.
 *   READ:  App reads from cache.
 *
 * Trade-off: Very low write latency. Risk of data loss if cache fails
 * before the background flush completes. Best for write-heavy workloads
 * where a small window of potential data loss is acceptable.
 */

import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  retryStrategy: (times) => Math.min(times * 100, 3000),
});

redis.on('error', (err) => console.error('[Redis:WriteBack]', err.message));

const KEY_PREFIX = 'wb:';

/** In-memory pending write queue: key → { value, dbWriter, timestamp } */
const pendingWrites = new Map();

/**
 * Write to cache immediately and queue a DB write for later.
 *
 * @param {string} key
 * @param {*} value
 * @param {function} dbWriter - async (key: string, value: *) => void
 * @returns {Promise<{ written: boolean, strategy: string, note: string }>}
 */
export async function writeBackSet(key, value, dbWriter) {
  await redis.setex(`${KEY_PREFIX}${key}`, 3600, JSON.stringify(value));

  // Queue the DB write — the caller's dbWriter is captured in closure
  pendingWrites.set(key, {
    value,
    dbWriter,
    timestamp: Date.now(),
  });

  return {
    written: true,
    strategy: 'write-back',
    note: 'DB write pending in queue',
    pendingCount: pendingWrites.size,
  };
}

/**
 * Read a value from cache.
 *
 * @param {string} key
 * @returns {Promise<{ data: *, source: 'cache'|'miss', strategy: string }>}
 */
export async function writeBackGet(key) {
  const cached = await redis.get(`${KEY_PREFIX}${key}`);

  if (cached !== null) {
    return {
      data: JSON.parse(cached),
      source: 'cache',
      strategy: 'write-back',
    };
  }

  return {
    data: null,
    source: 'miss',
    strategy: 'write-back',
  };
}

/**
 * Flush all pending writes to the database.
 * Called periodically or on demand.
 *
 * @returns {Promise<{ flushed: number, pending: number, errors: string[] }>}
 */
export async function flushPendingWrites() {
  const flushed = [];
  const errors = [];

  for (const [key, { value, dbWriter }] of pendingWrites) {
    try {
      await dbWriter(key, value);
      pendingWrites.delete(key);
      flushed.push(key);
    } catch (err) {
      console.error(`[WriteBack] Flush failed for key "${key}":`, err.message);
      errors.push(`${key}: ${err.message}`);
    }
  }

  return {
    flushed: flushed.length,
    pending: pendingWrites.size,
    errors,
  };
}

/**
 * Returns the current number of writes waiting to be flushed.
 * @returns {number}
 */
export function getPendingCount() {
  return pendingWrites.size;
}

/**
 * Returns metadata about all pending writes (key + timestamp).
 * @returns {Array<{ key: string, timestamp: string }>}
 */
export function getPendingWrites() {
  return Array.from(pendingWrites.entries()).map(([key, { timestamp }]) => ({
    key,
    queuedAt: new Date(timestamp).toISOString(),
    ageMs: Date.now() - timestamp,
  }));
}
