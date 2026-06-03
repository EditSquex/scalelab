import Fastify from 'fastify';
import cors from '@fastify/cors';
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import urlRoutes from './routes/urls.js';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Fastify instance with structured JSON logging
// ---------------------------------------------------------------------------
const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

// ---------------------------------------------------------------------------
// PostgreSQL connection pool
// ---------------------------------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:password@localhost:5432/urlshortener',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected pool error:', err.message);
});

let useMemoryDB = false;

/**
 * Initialise the database: create tables if they don't exist.
 */
async function initDatabase() {
  try {
    const schema = readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf-8');
    await pool.query(schema);
    fastify.log.info('[DB] Schema initialised');
  } catch (err) {
    fastify.log.warn('[PostgreSQL] Connection failed, falling back to local memory database.');
    useMemoryDB = true;
  }
}

// Expose the pool and mode via decorators
fastify.decorate('db', pool);
fastify.decorate('useMemoryDB', () => useMemoryDB);

// ---------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------
await fastify.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
});

// URL routes under /api prefix
await fastify.register(urlRoutes, { prefix: '/api' });

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
fastify.get('/health', async (request, reply) => {
  let dbOk = false;
  if (useMemoryDB) {
    dbOk = true;
  } else {
    try {
      await pool.query('SELECT 1');
      dbOk = true;
    } catch {
      dbOk = false;
    }
  }

  const status = dbOk ? 'ok' : 'degraded';
  return reply.status(dbOk ? 200 : 503).send({
    status,
    service: 'url-shortener',
    timestamp: new Date().toISOString(),
    dependencies: { postgres: dbOk ? 'ok' : 'error', dbType: useMemoryDB ? 'memory' : 'postgres' },
  });
});

// Root-level redirect handler (redirects /r/:shortCode to /api/r/:shortCode)
fastify.get('/r/:shortCode', async (request, reply) => {
  const { shortCode } = request.params;
  return reply.redirect(302, `/api/r/${shortCode}`);
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

try {
  await initDatabase();
  await fastify.listen({ port: PORT, host: HOST });
  fastify.log.info(`[URL Shortener] Listening on http://${HOST}:${PORT}`);
} catch (err) {
  fastify.log.error(err, 'Failed to start URL Shortener service');
  process.exit(1);
}
