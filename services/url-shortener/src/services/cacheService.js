import Redis from 'ioredis';

// Single shared Redis client instance
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  lazyConnect: false,
  retryStrategy: (times) => Math.min(times * 100, 3000),
  maxRetriesPerRequest: 1, // Fail fast to activate memory fallback
});

let useMemoryCache = false;
const memCache = new Map();
const memTtl = new Map();

function checkExpiry(key) {
  if (memTtl.has(key) && memTtl.get(key) < Date.now()) {
    memCache.delete(key);
    memTtl.delete(key);
    return true;
  }
  return false;
}

redis.on('connect', () => {
  console.log('[Redis] Connected');
  useMemoryCache = false;
});

redis.on('error', (err) => {
  if (!useMemoryCache) {
    console.warn('[Redis] Error connecting: falling back to local memory cache.');
    useMemoryCache = true;
  }
});

/**
 * Retrieve a value from Redis by key.
 * @param {string} key
 * @returns {Promise<string|null>}
 */
export async function get(key) {
  if (useMemoryCache) {
    if (checkExpiry(key)) return null;
    return memCache.get(key) || null;
  }
  try {
    return await redis.get(key);
  } catch (err) {
    useMemoryCache = true;
    return memCache.get(key) || null;
  }
}

/**
 * Store a value in Redis with an optional TTL.
 * @param {string} key
 * @param {string} value
 * @param {number} ttlSeconds - Default 3600 (1 hour)
 * @returns {Promise<string>}
 */
export async function set(key, value, ttlSeconds = 3600) {
  if (useMemoryCache) {
    memCache.set(key, value);
    memTtl.set(key, Date.now() + ttlSeconds * 1000);
    return 'OK';
  }
  try {
    return await redis.setex(key, ttlSeconds, value);
  } catch (err) {
    useMemoryCache = true;
    memCache.set(key, value);
    memTtl.set(key, Date.now() + ttlSeconds * 1000);
    return 'OK';
  }
}

/**
 * Delete one or more keys from Redis.
 * @param {string} key
 * @returns {Promise<number>}
 */
export async function del(key) {
  if (useMemoryCache) {
    const exists = memCache.has(key);
    memCache.delete(key);
    memTtl.delete(key);
    return exists ? 1 : 0;
  }
  try {
    return await redis.del(key);
  } catch (err) {
    useMemoryCache = true;
    const exists = memCache.has(key);
    memCache.delete(key);
    memTtl.delete(key);
    return exists ? 1 : 0;
  }
}

/**
 * Atomically increment a Redis counter.
 * @param {string} key
 * @returns {Promise<number>}
 */
export async function increment(key) {
  if (useMemoryCache) {
    const val = parseInt(memCache.get(key)) || 0;
    const newVal = val + 1;
    memCache.set(key, newVal.toString());
    return newVal;
  }
  try {
    return await redis.incr(key);
  } catch (err) {
    useMemoryCache = true;
    const val = parseInt(memCache.get(key)) || 0;
    const newVal = val + 1;
    memCache.set(key, newVal.toString());
    return newVal;
  }
}

export { redis };
