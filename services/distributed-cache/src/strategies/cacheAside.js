/**
 * Cache-Aside (Lazy Loading) Strategy
 *
 * Pattern:
 *   READ:  App checks cache → miss → load from DB → populate cache
 *   WRITE: App writes to DB only → cache entry is INVALIDATED (not updated)
 *
 * Trade-off: Cache is always eventually consistent; stale reads possible
 * between invalidation and next cache population.
 */

import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  retryStrategy: (times) => Math.min(times * 100, 3000),
});

redis.on('error', (err) => console.error('[Redis:CacheAside]', err.message));

const KEY_PREFIX = 'ca:';

/**
 * Get a value using the cache-aside pattern.
 * On cache miss, calls `dbFetcher(key)` to retrieve from DB and caches the result.
 *
 * @param {string} key
 * @param {function} dbFetcher - async (key: string) => data
 * @param {number} ttl - Cache TTL in seconds (default: 300)
 * @returns {Promise<{ data: *, source: 'cache'|'database', strategy: string }>}
 */
export async function cacheAsideGet(key, dbFetcher, ttl = 300) {
  const cacheKey = `${KEY_PREFIX}${key}`;

  const cached = await redis.get(cacheKey);
  if (cached !== null) {
    return {
      data: JSON.parse(cached),
      source: 'cache',
      strategy: 'cache-aside',
    };
  }

  // Cache miss — fetch from "database"
  const data = await dbFetcher(key);

  if (data !== null && data !== undefined) {
    await redis.setex(cacheKey, ttl, JSON.stringify(data));
  }

  return {
    data,
    source: 'database',
    strategy: 'cache-aside',
  };
}

/**
 * Invalidate a cache entry on write.
 * In cache-aside, the app writes to DB directly; we just evict the cache
 * so the next read will re-fetch fresh data.
 *
 * @param {string} key
 * @returns {Promise<{ invalidated: boolean, strategy: string }>}
 */
export async function cacheAsideSet(key, value, ttl = 300) {
  // Invalidate stale cache entry; DB write is handled by the caller
  await redis.del(`${KEY_PREFIX}${key}`);
  return { invalidated: true, strategy: 'cache-aside' };
}
