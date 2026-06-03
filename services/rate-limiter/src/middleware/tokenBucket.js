import { createClient } from './redisClient.js';

const redis = createClient();

// Inline Lua for the token bucket — avoids file I/O and keeps logic atomic
const TOKEN_BUCKET_SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local refillInterval = tonumber(ARGV[3])
local now = tonumber(ARGV[4])

local bucket = redis.call('HMGET', key, 'tokens', 'lastRefill')
local tokens = tonumber(bucket[1]) or capacity
local lastRefill = tonumber(bucket[2]) or now

-- Calculate how many tokens have been replenished since last access
local elapsed = now - lastRefill
local tokensToAdd = math.floor(elapsed / refillInterval) * refillRate
tokens = math.min(capacity, tokens + tokensToAdd)

if tokensToAdd > 0 then
  lastRefill = now
end

if tokens > 0 then
  tokens = tokens - 1
  redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', lastRefill)
  redis.call('EXPIRE', key, 3600)
  return {1, tokens, capacity}
else
  redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', lastRefill)
  redis.call('EXPIRE', key, 3600)
  return {0, 0, capacity}
end
`;

/**
 * Token Bucket rate limiting middleware for Fastify.
 *
 * Each client gets a bucket of tokens that refills at a fixed rate.
 * Requests consume one token; if the bucket is empty the request is rejected.
 * State is stored in a Redis hash for persistence and consistency.
 *
 * @param {FastifyRequest} request
 * @param {FastifyReply} reply
 * @param {object} options
 * @param {number} options.capacity           - Max tokens in bucket (default: 10)
 * @param {number} options.refillRate         - Tokens added per interval (default: 1)
 * @param {number} options.refillIntervalMs   - Refill interval in ms (default: 1000)
 * @param {string} options.keyPrefix          - Redis key prefix (default: 'rl:tb')
 */
export async function tokenBucketMiddleware(request, reply, options = {}) {
  const {
    capacity = 10,
    refillRate = 1,
    refillIntervalMs = 1000,
    keyPrefix = 'rl:tb',
  } = options;

  const identifier =
    request.headers['x-user-id'] || request.ip || 'anonymous';
  const key = `${keyPrefix}:${identifier}`;
  const now = Date.now();

  const [allowed, remaining, total] = await redis.eval(
    TOKEN_BUCKET_SCRIPT,
    1,
    key,
    capacity,
    refillRate,
    refillIntervalMs,
    now
  );

  reply.header('X-RateLimit-Limit', total);
  reply.header('X-RateLimit-Remaining', remaining);
  reply.header('X-RateLimit-Algorithm', 'token-bucket');

  if (!allowed) {
    return reply.status(429).send({
      error: 'Too Many Requests',
      algorithm: 'token-bucket',
      capacity,
      refillRate,
      retryAfter: Math.ceil(refillIntervalMs / 1000),
    });
  }
}
