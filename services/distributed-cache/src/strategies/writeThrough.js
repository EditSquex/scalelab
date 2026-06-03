/**
 * Write-Through Cache Strategy
 *
 * Pattern:
 *   WRITE: App writes to BOTH cache AND DB synchronously (in parallel).
 *   READ:  App reads from cache; cache always reflects DB state.
 *
 * Trade-off: Strong consistency. Every write incurs DB latency.
 * Best for read-heavy workloads where stale data is unacceptable.
 */

import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  retryStrategy: (times) => Math.min(times * 100, 3000),
});

redis.on('error', (err) => console.error('[Redis:WriteThrough]', err.message));

const KEY_PREFIX = 'wt:';

/**
 * Write a value to both cache and DB simultaneously.
 * Both writes happen in parallel; the operation succeeds only when both complete.
 *
 * @param {string} key
 * @param {*} value
 * @param {function} dbWriter - async (key: string, value: *) => void
 * @param {number} ttl - Cache TTL in seconds (default: 300)
 * @returns {Promise<{ written: boolean, strategy: string, consistency: string }>}
 */
export async function writeThroughSet(key, value, dbWriter, ttl = 300) {
  await Promise.all([
    redis.setex(`${KEY_PREFIX}${key}`, ttl, JSON.stringify(value)),
    dbWriter(key, value),
  ]);

  return {
    written: true,
    strategy: 'write-through',
    consistency: 'strong',
  };
}

/**
 * Read a value from cache.
 * In write-through, the cache is always warm (populated on every write).
 *
 * @param {string} key
 * @returns {Promise<{ data: *, source: 'cache'|'miss', strategy: string }>}
 */
export async function writeThroughGet(key) {
  const cached = await redis.get(`${KEY_PREFIX}${key}`);

  if (cached !== null) {
    return {
      data: JSON.parse(cached),
      source: 'cache',
      strategy: 'write-through',
    };
  }

  return {
    data: null,
    source: 'miss',
    strategy: 'write-through',
  };
}
