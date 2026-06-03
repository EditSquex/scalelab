import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { fetch } from 'undici';
import RoundRobinBalancer from './balancer/roundRobin.js';
import CircuitBreaker from './middleware/circuitBreaker.js';
import { optionalAuth } from './middleware/auth.js';

// ---------------------------------------------------------------------------
// Fastify instance
// ---------------------------------------------------------------------------
const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

// ---------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------
await fastify.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
});

await fastify.register(jwt, {
  secret: process.env.JWT_SECRET || 'scalelab-secret-key-2024',
});

// ---------------------------------------------------------------------------
// Service registry — backends per service
// Each service can have multiple backend URLs for load balancing.
// In development, each service only has one instance.
// ---------------------------------------------------------------------------
const SERVICE_URLS = {
  'url-shortener': [
    process.env.URL_SHORTENER_URL || 'http://localhost:3001',
  ],
  'rate-limiter': [
    process.env.RATE_LIMITER_URL || 'http://localhost:3002',
  ],
  'distributed-cache': [
    process.env.CACHE_URL || 'http://localhost:3003',
  ],
  'job-queue': [
    process.env.JOB_QUEUE_URL || 'http://localhost:3004',
  ],
  'pub-sub': [
    process.env.PUB_SUB_URL || 'http://localhost:3005',
  ],
};

// Create one balancer and one circuit breaker per service
const balancers = {};
const circuitBreakers = {};

for (const [service, urls] of Object.entries(SERVICE_URLS)) {
  balancers[service] = new RoundRobinBalancer(urls);
  circuitBreakers[service] = new CircuitBreaker({
    name: service,
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
  });
}

// ---------------------------------------------------------------------------
// Helper: proxy a request to a backend service
// ---------------------------------------------------------------------------
async function proxyRequest(service, path, method, headers, body) {
  const cb = circuitBreakers[service];
  const balancer = balancers[service];

  if (!balancer) {
    return { status: 404, data: { error: `Unknown service: ${service}` } };
  }

  // Circuit breaker check
  if (!cb.canRequest()) {
    const state = cb.getState();
    return {
      status: 503,
      data: {
        error: 'Service temporarily unavailable',
        reason: 'Circuit breaker OPEN',
        service,
        nextRetry: state.nextRetry,
        circuitBreakerState: state,
      },
    };
  }

  let backend;
  try {
    backend = balancer.next();
  } catch (err) {
    cb.onFailure();
    return { status: 503, data: { error: err.message, service } };
  }

  const targetUrl = `${backend.url}${path}`;
  const start = Date.now();

  try {
    // Strip hop-by-hop headers before forwarding
    const forwardHeaders = { ...headers };
    const hopByHop = ['host', 'connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade'];
    for (const h of hopByHop) delete forwardHeaders[h];
    forwardHeaders['x-forwarded-by'] = 'scalelab-gateway';
    forwardHeaders['x-request-id'] = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const fetchOptions = {
      method,
      headers: forwardHeaders,
      signal: AbortSignal.timeout(10000), // 10s timeout
    };

    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const latencyMs = Date.now() - start;

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    balancer.recordLatency(backend.url, latencyMs, !response.ok);

    if (response.ok) {
      cb.onSuccess();
    } else if (response.status >= 500) {
      cb.onFailure();
    }

    return {
      status: response.status,
      data: responseData,
      backend: backend.url,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    balancer.recordLatency(backend.url, latencyMs, true);
    balancer.markUnhealthy(backend.url);
    cb.onFailure();

    fastify.log.error(`[Gateway] Proxy error for ${service}: ${err.message}`);
    return {
      status: 502,
      data: { error: 'Bad Gateway', message: err.message, service, backend: backend.url },
      latencyMs,
    };
  }
}

// ---------------------------------------------------------------------------
// JWT Token generation (demo endpoint — no real auth store)
// ---------------------------------------------------------------------------
fastify.post('/api/token', {
  schema: {
    body: {
      type: 'object',
      required: ['userId'],
      properties: {
        userId: { type: 'string' },
        role: { type: 'string', enum: ['admin', 'user', 'readonly'], default: 'user' },
      },
    },
  },
}, async (request, reply) => {
  const { userId, role = 'user' } = request.body;

  const token = fastify.jwt.sign(
    {
      userId,
      role,
      iss: 'scalelab-gateway',
      iat: Math.floor(Date.now() / 1000),
    },
    { expiresIn: '24h' }
  );

  return reply.send({
    token,
    type: 'Bearer',
    expiresIn: '24h',
    userId,
    role,
    note: 'This is a demo token — no real credentials are stored',
  });
});

// ---------------------------------------------------------------------------
// Generic proxy route — forwards to appropriate backend service
//
// GET/POST/etc. /api/route/:service/*
// ---------------------------------------------------------------------------
fastify.all('/api/route/:service/*', { preHandler: optionalAuth }, async (request, reply) => {
  const { service } = request.params;
  // Extract the sub-path after /api/route/:service
  const path = '/' + (request.params['*'] || '');
  const queryString = new URLSearchParams(request.query).toString();
  const fullPath = queryString ? `${path}?${queryString}` : path;

  const { status, data, backend, latencyMs } = await proxyRequest(
    service,
    fullPath,
    request.method,
    request.headers,
    request.body
  );

  if (backend) {
    reply.header('X-Backend', backend);
    reply.header('X-Latency-Ms', latencyMs);
    reply.header('X-Service', service);
  }

  return reply.status(status).send(data);
});

// ---------------------------------------------------------------------------
// Gateway Stats
// ---------------------------------------------------------------------------
fastify.get('/api/gateway/stats', async (request, reply) => {
  const stats = {};
  const cbStates = {};

  for (const service of Object.keys(SERVICE_URLS)) {
    stats[service] = balancers[service].getStats();
    cbStates[service] = circuitBreakers[service].getState();
  }

  return reply.send({
    balancers: stats,
    circuitBreakers: cbStates,
    services: Object.keys(SERVICE_URLS),
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Circuit Breaker Demo Control
// POST /api/gateway/test-circuit-breaker
// body: { service: string, state: 'OPEN' | 'CLOSED' | 'HALF_OPEN' }
// ---------------------------------------------------------------------------
fastify.post('/api/gateway/test-circuit-breaker', {
  schema: {
    body: {
      type: 'object',
      required: ['service'],
      properties: {
        service: { type: 'string' },
        state: { type: 'string', enum: ['OPEN', 'CLOSED', 'HALF_OPEN'] },
        forceOpen: { type: 'boolean' },
      },
    },
  },
}, async (request, reply) => {
  const { service, state, forceOpen } = request.body;

  if (!circuitBreakers[service]) {
    return reply.status(404).send({ error: `Service "${service}" not found` });
  }

  const cb = circuitBreakers[service];

  // Support both `state` and legacy `forceOpen` boolean
  const targetState = state || (forceOpen ? 'OPEN' : 'CLOSED');
  const success = cb.forceState(targetState);

  return reply.send({
    service,
    previousState: cb.getState().state,
    newState: targetState,
    success,
    circuitBreaker: cb.getState(),
  });
});

// ---------------------------------------------------------------------------
// Health check — polls all backend services
// ---------------------------------------------------------------------------
fastify.get('/api/gateway/health', async (request, reply) => {
  const results = {};

  await Promise.allSettled(
    Object.entries(SERVICE_URLS).map(async ([service, urls]) => {
      const url = `${urls[0]}/health`;
      const start = Date.now();
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        const data = await res.json();
        results[service] = {
          status: res.ok ? 'healthy' : 'unhealthy',
          httpStatus: res.status,
          latencyMs: Date.now() - start,
          url: urls[0],
          data,
        };
        if (res.ok) {
          balancers[service].markHealthy(urls[0]);
        } else {
          balancers[service].markUnhealthy(urls[0]);
        }
      } catch (err) {
        results[service] = {
          status: 'unreachable',
          error: err.message,
          latencyMs: Date.now() - start,
          url: urls[0],
        };
        balancers[service].markUnhealthy(urls[0]);
      }
    })
  );

  const allHealthy = Object.values(results).every((r) => r.status === 'healthy');

  return reply.status(allHealthy ? 200 : 207).send({
    gateway: 'healthy',
    services: results,
    summary: {
      total: Object.keys(results).length,
      healthy: Object.values(results).filter((r) => r.status === 'healthy').length,
      unhealthy: Object.values(results).filter((r) => r.status !== 'healthy').length,
    },
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Gateway own health
// ---------------------------------------------------------------------------
fastify.get('/health', async (request, reply) => {
  return reply.send({
    status: 'ok',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ---------------------------------------------------------------------------
// Periodic health checks (every 10 seconds)
// ---------------------------------------------------------------------------
function scheduleHealthChecks() {
  setInterval(async () => {
    for (const [service, urls] of Object.entries(SERVICE_URLS)) {
      for (const url of urls) {
        try {
          const res = await fetch(`${url}/health`, {
            signal: AbortSignal.timeout(2000),
          });
          if (res.ok) {
            balancers[service].markHealthy(url);
          } else {
            balancers[service].markUnhealthy(url);
          }
        } catch {
          balancers[service].markUnhealthy(url);
        }
      }
    }
  }, 10000);
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT) || 3006;
const HOST = process.env.HOST || '0.0.0.0';

try {
  scheduleHealthChecks();

  await fastify.listen({ port: PORT, host: HOST });
  fastify.log.info(`[API Gateway] Listening on http://${HOST}:${PORT}`);
} catch (err) {
  fastify.log.error(err, 'Failed to start API Gateway service');
  process.exit(1);
}
