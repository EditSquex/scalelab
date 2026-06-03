import { createClient } from './redisClient.js';

const redis = createClient();

/**
 * Fixed Window rate limiting middleware for Fastify.
 *
 * Divides time into fixed-size windows aligned to clock boundaries.
 * Each client gets `limit` requests per window. Simple and fast, but
 * susceptible to the "boundary burst" problem (2x requests at window edges).
 *
 * @param {FastifyRequest} request
 * @param {FastifyReply} reply
 * @param {object} options
 * @param {number} options.limit      - Max requests per window (default: 10)
 * @param {number} options.windowMs   - Window size in ms (default: 60000)
 * @param {string} options.keyPrefix  - Redis key prefix (default: 'rl:fw')
 */
export async function fixedWindowMiddleware(request, reply, options = {}) {
  const {
    limit = 10,
    windowMs = 60000,
    keyPrefix = 'rl:fw',
  } = options;

  const identifier =
    request.headers['x-user-id'] || request.ip || 'anonymous';

  // Align the window to clock boundaries (e.g. 0–60s, 60–120s)
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const windowEnd = windowStart + windowMs;
  const key = `${keyPrefix}:${identifier}:${windowStart}`;

  // Increment atomically; set expiry only on first increment
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, windowMs);
  }

  const remaining = Math.max(0, limit - count);

  reply.header('X-RateLimit-Limit', limit);
  reply.header('X-RateLimit-Remaining', remaining);
  reply.header('X-RateLimit-Algorithm', 'fixed-window');
  reply.header('X-RateLimit-Reset', new Date(windowEnd).toISOString());

  if (count > limit) {
    return reply.status(429).send({
      error: 'Too Many Requests',
      algorithm: 'fixed-window',
      limit,
      windowMs,
      count,
      remaining: 0,
      resetAt: new Date(windowEnd).toISOString(),
    });
  }
}
