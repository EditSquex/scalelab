import { createClient } from './redisClient.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const redis = createClient();

// Load the Lua script once at module initialisation
const luaScript = readFileSync(
  path.join(__dirname, '../scripts/rate-limit.lua'),
  'utf-8'
);

/**
 * Sliding Window rate limiting middleware for Fastify.
 *
 * Uses a Redis sorted set to track request timestamps within a rolling window.
 * The Lua script executes atomically to prevent race conditions under concurrency.
 *
 * @param {FastifyRequest} request
 * @param {FastifyReply} reply
 * @param {object} options
 * @param {number} options.limit      - Max requests per window (default: 10)
 * @param {number} options.windowMs   - Window size in ms (default: 60000)
 * @param {string} options.keyPrefix  - Redis key prefix (default: 'rl:sw')
 * @returns {Promise<void|FastifyReply>} - Returns reply if rate limited
 */
export async function slidingWindowMiddleware(request, reply, options = {}) {
  const {
    limit = 10,
    windowMs = 60000,
    keyPrefix = 'rl:sw',
  } = options;

  const identifier =
    request.headers['x-user-id'] || request.ip || 'anonymous';
  const key = `${keyPrefix}:${identifier}`;
  const now = Date.now();

  const [allowed, remaining, total] = await redis.eval(
    luaScript,
    1,
    key,
    now,
    windowMs,
    limit
  );

  reply.header('X-RateLimit-Limit', total);
  reply.header('X-RateLimit-Remaining', remaining);
  reply.header('X-RateLimit-Algorithm', 'sliding-window');

  if (!allowed) {
    return reply.status(429).send({
      error: 'Too Many Requests',
      algorithm: 'sliding-window',
      limit,
      windowMs,
      retryAfter: Math.ceil(windowMs / 1000),
    });
  }
}
