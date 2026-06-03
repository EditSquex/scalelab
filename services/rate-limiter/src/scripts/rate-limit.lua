-- Sliding Window Rate Limiter Lua script
-- Executes atomically in Redis, preventing race conditions
--
-- KEYS[1]: rate limit key (e.g. "rl:sw:192.168.1.1")
-- ARGV[1]: current timestamp in milliseconds
-- ARGV[2]: window size in milliseconds
-- ARGV[3]: max requests allowed per window
--
-- Returns: {allowed, remaining, limit}
--   allowed: 1 if request is permitted, 0 if rate limited
--   remaining: tokens remaining in current window
--   limit: configured max requests

local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

-- Remove entries that have fallen outside the sliding window
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)

-- Count requests in the current window
local count = redis.call('ZCARD', key)

if count < limit then
  -- Request is within limit — record it with a unique member
  redis.call('ZADD', key, now, now .. '-' .. math.random(1000000))
  redis.call('PEXPIRE', key, window)
  return {1, limit - count - 1, limit}
else
  -- Rate limit exceeded
  return {0, 0, limit}
end
