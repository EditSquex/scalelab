import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createClient } from './middleware/redisClient.js';
import { slidingWindowMiddleware } from './middleware/slidingWindow.js';
import { tokenBucketMiddleware } from './middleware/tokenBucket.js';
import { fixedWindowMiddleware } from './middleware/fixedWindow.js';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

const redis = createClient();

await fastify.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
});

// ---------------------------------------------------------------------------
// POST /api/test
// Applies all three algorithms sequentially and returns a side-by-side
// comparison so the dashboard can visualise the differences.
// ---------------------------------------------------------------------------
fastify.post('/api/test', async (request, reply) => {
  const identifier =
    request.headers['x-user-id'] || request.ip || 'anonymous';

  const results = {};

  // --- Sliding Window ---
  const swStart = Date.now();
  const swReply = {
    status: () => swReply,
    send: (body) => { results.slidingWindow = { ...body, responseTimeMs: Date.now() - swStart }; return swReply; },
    header: () => swReply,
  };
  let swAllowed = true;
  let swRemaining = 0;
  const swHeaders = {};
  const mockSwReply = {
    header: (k, v) => { swHeaders[k] = v; },
    status: (code) => ({
      send: (body) => {
        swAllowed = false;
        results.slidingWindow = { allowed: false, remaining: 0, ...body, responseTimeMs: Date.now() - swStart };
      },
    }),
  };

  await slidingWindowMiddleware(request, mockSwReply, { limit: 10, windowMs: 60000 });
  if (swAllowed) {
    results.slidingWindow = {
      allowed: true,
      remaining: Number(swHeaders['X-RateLimit-Remaining']),
      limit: Number(swHeaders['X-RateLimit-Limit']),
      algorithm: 'sliding-window',
      responseTimeMs: Date.now() - swStart,
    };
  }

  // --- Token Bucket ---
  const tbStart = Date.now();
  const tbHeaders = {};
  let tbAllowed = true;
  const mockTbReply = {
    header: (k, v) => { tbHeaders[k] = v; },
    status: (code) => ({
      send: (body) => {
        tbAllowed = false;
        results.tokenBucket = { allowed: false, remaining: 0, ...body, responseTimeMs: Date.now() - tbStart };
      },
    }),
  };

  await tokenBucketMiddleware(request, mockTbReply, {
    capacity: 10,
    refillRate: 1,
    refillIntervalMs: 1000,
  });
  if (tbAllowed) {
    results.tokenBucket = {
      allowed: true,
      remaining: Number(tbHeaders['X-RateLimit-Remaining']),
      limit: Number(tbHeaders['X-RateLimit-Limit']),
      algorithm: 'token-bucket',
      responseTimeMs: Date.now() - tbStart,
    };
  }

  // --- Fixed Window ---
  const fwStart = Date.now();
  const fwHeaders = {};
  let fwAllowed = true;
  const mockFwReply = {
    header: (k, v) => { fwHeaders[k] = v; },
    status: (code) => ({
      send: (body) => {
        fwAllowed = false;
        results.fixedWindow = { allowed: false, remaining: 0, ...body, responseTimeMs: Date.now() - fwStart };
      },
    }),
  };

  await fixedWindowMiddleware(request, mockFwReply, { limit: 10, windowMs: 60000 });
  if (fwAllowed) {
    results.fixedWindow = {
      allowed: true,
      remaining: Number(fwHeaders['X-RateLimit-Remaining']),
      limit: Number(fwHeaders['X-RateLimit-Limit']),
      algorithm: 'fixed-window',
      responseTimeMs: Date.now() - fwStart,
      resetAt: fwHeaders['X-RateLimit-Reset'],
    };
  }

  return reply.send({ identifier, timestamp: new Date().toISOString(), results });
});

// ---------------------------------------------------------------------------
// GET /api/stats
// Returns current rate limit counters for the requesting IP/user across
// all three algorithms. Useful for the dashboard to show live state.
// ---------------------------------------------------------------------------
fastify.get('/api/stats', async (request, reply) => {
  const identifier =
    request.headers['x-user-id'] || request.ip || 'anonymous';

  const now = Date.now();
  const windowMs = 60000;
  const windowStart = Math.floor(now / windowMs) * windowMs;

  // Fetch raw Redis data for each algorithm
  const [swCount, tbBucket, fwCount] = await Promise.all([
    redis.zcard(`rl:sw:${identifier}`),
    redis.hmget(`rl:tb:${identifier}`, 'tokens', 'lastRefill'),
    redis.get(`rl:fw:${identifier}:${windowStart}`),
  ]);

  return reply.send({
    identifier,
    timestamp: new Date().toISOString(),
    slidingWindow: {
      currentCount: swCount,
      limit: 10,
      windowMs,
      remaining: Math.max(0, 10 - swCount),
    },
    tokenBucket: {
      currentTokens: tbBucket[0] !== null ? Number(tbBucket[0]) : 10,
      lastRefill: tbBucket[1] !== null ? new Date(Number(tbBucket[1])).toISOString() : null,
      capacity: 10,
    },
    fixedWindow: {
      currentCount: fwCount !== null ? Number(fwCount) : 0,
      limit: 10,
      windowMs,
      remaining: Math.max(0, 10 - (fwCount !== null ? Number(fwCount) : 0)),
      resetAt: new Date(windowStart + windowMs).toISOString(),
    },
  });
});

// ---------------------------------------------------------------------------
// GET /api/simulate
// Simulates N requests against a chosen algorithm and reports how many
// were allowed vs blocked. Great for demos and visualisation.
//
// Query params:
//   algorithm  - 'sliding' | 'token' | 'fixed'   (default: sliding)
//   requests   - total requests to simulate        (default: 20, max: 200)
//   concurrency- requests per batch                (default: 5)
// ---------------------------------------------------------------------------
fastify.get('/api/simulate', async (request, reply) => {
  const algorithm = request.query.algorithm || 'sliding';
  const totalRequests = Math.min(200, parseInt(request.query.requests) || 20);
  const concurrency = Math.min(50, parseInt(request.query.concurrency) || 5);

  // Unique simulation user so it doesn't pollute real rate limit state
  const simulationUser = `sim-${algorithm}-${Date.now()}`;
  const simulatedRequest = {
    headers: { 'x-user-id': simulationUser },
    ip: '127.0.0.1',
  };

  let allowed = 0;
  let blocked = 0;
  const timeline = [];

  const middlewareFn =
    algorithm === 'token'
      ? (req, rep) => tokenBucketMiddleware(req, rep, { capacity: 10, refillRate: 1, refillIntervalMs: 500 })
      : algorithm === 'fixed'
        ? (req, rep) => fixedWindowMiddleware(req, rep, { limit: 10, windowMs: 10000 })
        : (req, rep) => slidingWindowMiddleware(req, rep, { limit: 10, windowMs: 10000 });

  // Process requests in batches of `concurrency`
  for (let i = 0; i < totalRequests; i += concurrency) {
    const batch = Math.min(concurrency, totalRequests - i);
    const batchPromises = Array.from({ length: batch }, (_, j) => {
      const reqIndex = i + j;
      return new Promise(async (resolve) => {
        let wasAllowed = true;
        let remaining = 0;
        const mockReply = {
          header: (k, v) => {
            if (k === 'X-RateLimit-Remaining') remaining = Number(v);
          },
          status: () => ({
            send: (body) => {
              wasAllowed = false;
              resolve({ request: reqIndex + 1, allowed: false, remaining: 0 });
            },
          }),
        };

        await middlewareFn(simulatedRequest, mockReply);
        if (wasAllowed) {
          resolve({ request: reqIndex + 1, allowed: true, remaining });
        }
      });
    });

    const batchResults = await Promise.all(batchPromises);
    for (const result of batchResults) {
      timeline.push(result);
      if (result.allowed) allowed++;
      else blocked++;
    }

    // Small gap between batches
    await new Promise(r => setTimeout(r, 50));
  }

  return reply.send({
    algorithm,
    totalRequests,
    concurrency,
    summary: { allowed, blocked, blockedRate: `${((blocked / totalRequests) * 100).toFixed(1)}%` },
    timeline,
  });
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
    service: 'rate-limiter',
    timestamp: new Date().toISOString(),
    dependencies: { redis: redisOk ? 'ok' : 'error' },
  });
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT) || 3002;
const HOST = process.env.HOST || '0.0.0.0';

try {
  await fastify.listen({ port: PORT, host: HOST });
  fastify.log.info(`[Rate Limiter] Listening on http://${HOST}:${PORT}`);
} catch (err) {
  fastify.log.error(err, 'Failed to start Rate Limiter service');
  process.exit(1);
}
