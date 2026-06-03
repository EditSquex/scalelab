import Fastify from 'fastify';
import cors from '@fastify/cors';
import Redis from 'ioredis';
import { LRUCache } from './lru/LRUCache.js';
import { cacheAsideGet, cacheAsideSet } from './strategies/cacheAside.js';
import { writeThroughGet, writeThroughSet } from './strategies/writeThrough.js';
import {
  writeBackGet,
  writeBackSet,
  flushPendingWrites,
  getPendingCount,
  getPendingWrites,
} from './strategies/writeBack.js';

// ---------------------------------------------------------------------------
// Fastify instance
// ---------------------------------------------------------------------------
const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

// ---------------------------------------------------------------------------
// In-memory "database" simulation
// Simulates DB reads with 100ms artificial latency to demonstrate cache benefit
// ---------------------------------------------------------------------------
const mockDB = new Map();

// Seed some initial data
for (let i = 1; i <= 20; i++) {
  mockDB.set(`product:${i}`, {
    id: i,
    name: `Product ${i}`,
    price: parseFloat((Math.random() * 100 + 1).toFixed(2)),
    category: ['electronics', 'clothing', 'books', 'food'][i % 4],
    stock: Math.floor(Math.random() * 500),
  });
}

/** Simulated DB read — returns data after 100ms artificial latency */
async function dbFetch(key) {
  await new Promise((r) => setTimeout(r, 100));
  return mockDB.get(key) ?? null;
}

/** Simulated DB write — persists data after 100ms artificial latency */
async function dbWrite(key, value) {
  await new Promise((r) => setTimeout(r, 100));
  mockDB.set(key, value);
}

// ---------------------------------------------------------------------------
// LRU Cache instance (capacity: 50 items)
// ---------------------------------------------------------------------------
const lru = new LRUCache(50);

// ---------------------------------------------------------------------------
// Redis client for stats endpoint
// ---------------------------------------------------------------------------
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  retryStrategy: (times) => Math.min(times * 100, 3000),
});
redis.on('error', (err) => fastify.log.error('[Redis]', err.message));

// ---------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------
await fastify.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

// ---------------------------------------------------------------------------
// LRU Routes
// ---------------------------------------------------------------------------

/** GET /api/lru/get/:key — Retrieve a value from the LRU cache */
fastify.get('/api/lru/get/:key', async (request, reply) => {
  const { key } = request.params;
  const value = lru.get(key);

  if (value === -1) {
    return reply.status(404).send({
      found: false,
      key,
      value: null,
      stats: lru.getStats(),
    });
  }

  return reply.send({ found: true, key, value, stats: lru.getStats() });
});

/** PUT /api/lru/set — Store a key-value pair in the LRU cache */
fastify.put('/api/lru/set', {
  schema: {
    body: {
      type: 'object',
      required: ['key', 'value'],
      properties: {
        key: { type: 'string' },
        value: {},
        ttlMs: { type: 'number' },
      },
    },
  },
}, async (request, reply) => {
  const { key, value, ttlMs } = request.body;
  lru.put(key, value, ttlMs);
  return reply.send({ stored: true, key, value, stats: lru.getStats() });
});

/** GET /api/lru/stats — Return LRU cache statistics */
fastify.get('/api/lru/stats', async (request, reply) => {
  return reply.send(lru.getStats());
});

/** GET /api/lru/entries — All cache entries in MRU order */
fastify.get('/api/lru/entries', async (request, reply) => {
  return reply.send({ entries: lru.toArray(), stats: lru.getStats() });
});

// ---------------------------------------------------------------------------
// Strategy Routes
// ---------------------------------------------------------------------------

/**
 * POST /api/strategy/get
 * body: { key, strategy: 'cache-aside' | 'write-through' | 'write-back' }
 */
fastify.post('/api/strategy/get', {
  schema: {
    body: {
      type: 'object',
      required: ['key', 'strategy'],
      properties: {
        key: { type: 'string' },
        strategy: { type: 'string', enum: ['cache-aside', 'write-through', 'write-back'] },
      },
    },
  },
}, async (request, reply) => {
  try {
    const { key, strategy } = request.body;
    const start = Date.now();
    let result;

    switch (strategy) {
      case 'cache-aside':
        result = await cacheAsideGet(key, dbFetch);
        break;
      case 'write-through':
        result = await writeThroughGet(key);
        break;
      case 'write-back':
        result = await writeBackGet(key);
        break;
      default:
        return reply.status(400).send({ error: 'Unknown strategy' });
    }

    return reply.send({ ...result, latencyMs: Date.now() - start });
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Internal server error' });
  }
});

/**
 * POST /api/strategy/set
 * body: { key, value, strategy }
 */
fastify.post('/api/strategy/set', {
  schema: {
    body: {
      type: 'object',
      required: ['key', 'value', 'strategy'],
      properties: {
        key: { type: 'string' },
        value: {},
        strategy: { type: 'string', enum: ['cache-aside', 'write-through', 'write-back'] },
        ttl: { type: 'number' },
      },
    },
  },
}, async (request, reply) => {
  try {
    const { key, value, strategy, ttl = 300 } = request.body;
    const start = Date.now();
    let result;

    switch (strategy) {
      case 'cache-aside':
        // Write to DB first, then invalidate cache
        await dbWrite(key, value);
        result = await cacheAsideSet(key, value, ttl);
        break;
      case 'write-through':
        result = await writeThroughSet(key, value, dbWrite, ttl);
        break;
      case 'write-back':
        result = await writeBackSet(key, value, dbWrite);
        break;
      default:
        return reply.status(400).send({ error: 'Unknown strategy' });
    }

    return reply.send({ ...result, latencyMs: Date.now() - start });
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Internal server error' });
  }
});

/** POST /api/strategy/flush — Flush write-back pending queue to DB */
fastify.post('/api/strategy/flush', async (request, reply) => {
  try {
    const result = await flushPendingWrites();
    return reply.send({ ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Combined Stats
// ---------------------------------------------------------------------------
fastify.get('/api/stats', async (request, reply) => {
  try {
    let redisInfo = {};
    try {
      const info = await redis.info('memory');
      const memMatch = info.match(/used_memory_human:(\S+)/);
      const peakMatch = info.match(/used_memory_peak_human:(\S+)/);
      redisInfo = {
        usedMemory: memMatch ? memMatch[1] : 'unknown',
        peakMemory: peakMatch ? peakMatch[1] : 'unknown',
      };
    } catch {
      redisInfo = { error: 'Redis unavailable' };
    }

    return reply.send({
      lru: lru.getStats(),
      redis: redisInfo,
      writeBack: {
        pendingWrites: getPendingCount(),
        queue: getPendingWrites(),
      },
      strategies: {
        'cache-aside': { description: 'Lazy loading — cache populated on read miss' },
        'write-through': { description: 'Sync write to cache + DB — strong consistency' },
        'write-back': { description: 'Cache write only — async DB flush — low latency' },
      },
      mockDb: {
        size: mockDB.size,
        keys: Array.from(mockDB.keys()).slice(0, 10),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
fastify.get('/health', async (request, reply) => {
  let redisOk = false;
  try {
    await redis.ping();
    redisOk = true;
  } catch {
    redisOk = false;
  }

  return reply.status(redisOk ? 200 : 503).send({
    status: redisOk ? 'ok' : 'degraded',
    service: 'distributed-cache',
    timestamp: new Date().toISOString(),
    lruSize: lru.getStats().size,
    dependencies: { redis: redisOk ? 'ok' : 'error' },
  });
});

// ---------------------------------------------------------------------------
// Periodic write-back flush (every 5 seconds)
// ---------------------------------------------------------------------------
setInterval(async () => {
  if (getPendingCount() > 0) {
    fastify.log.info(`[WriteBack] Auto-flushing ${getPendingCount()} pending writes`);
    const result = await flushPendingWrites();
    fastify.log.info('[WriteBack] Flush complete:', result);
  }
}, 5000);

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT) || 3003;
const HOST = process.env.HOST || '0.0.0.0';

try {
  await fastify.listen({ port: PORT, host: HOST });
  fastify.log.info(`[Distributed Cache] Listening on http://${HOST}:${PORT}`);
} catch (err) {
  fastify.log.error(err, 'Failed to start Distributed Cache service');
  process.exit(1);
}
