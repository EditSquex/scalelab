import { generateShortCode } from '../services/hashService.js';
import { get, set, del } from '../services/cacheService.js';
import { trackClick, getAnalytics } from '../services/analyticsService.js';

// In-memory data store for URL records
const memDbMap = new Map();
let nextId = 1;

/**
 * URL Routes plugin for Fastify.
 * Handles shortening, redirecting, analytics, listing, and deletion.
 */
export default async function urlRoutes(fastify, options) {
  const db = fastify.db; // pg Pool injected via fastify decorator

  // ---------------------------------------------------------------------------
  // POST /shorten — Create a new short URL
  // ---------------------------------------------------------------------------
  fastify.post('/shorten', {
    schema: {
      body: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string', minLength: 1 },
          expiresIn: { type: 'number', minimum: 1 },
        },
      },
    },
  }, async (request, reply) => {
    try {
      let { url, expiresIn } = request.body;
      url = url.trim();

      // Validate URL format
      try {
        new URL(url);
      } catch (err) {
        return reply.status(400).send({ error: 'Invalid URL format' });
      }

      // Generate short code, retry on collision
      let shortCode;
      let attempt = 0;
      const MAX_ATTEMPTS = 10;

      while (attempt < MAX_ATTEMPTS) {
        shortCode = generateShortCode(url, attempt);

        let isCollision = false;
        let existingUrl = null;

        if (fastify.useMemoryDB()) {
          const existingRow = memDbMap.get(shortCode);
          if (existingRow) {
            isCollision = true;
            existingUrl = existingRow.original_url;
          }
        } else {
          const existing = await db.query(
            'SELECT original_url FROM urls WHERE short_code = $1',
            [shortCode]
          );
          if (existing.rows.length > 0) {
            isCollision = true;
            existingUrl = existing.rows[0].original_url;
          }
        }

        if (!isCollision) {
          // No collision — safe to use
          break;
        }

        if (existingUrl === url) {
          // Same URL already shortened — return existing
          const host = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
          return reply.send({
            shortCode,
            shortUrl: `${host}/r/${shortCode}`,
            originalUrl: url,
          });
        }

        // Collision with a different URL — try next attempt
        attempt++;
      }

      if (attempt >= MAX_ATTEMPTS) {
        return reply.status(500).send({ error: 'Failed to generate unique short code' });
      }

      // Calculate expiry timestamp if requested
      const expiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : null;

      // Persist to database
      if (fastify.useMemoryDB()) {
        memDbMap.set(shortCode, {
          id: nextId++,
          short_code: shortCode,
          original_url: url,
          created_at: new Date().toISOString(),
          expires_at: expiresAt,
          click_count: 0
        });
      } else {
        await db.query(
          `INSERT INTO urls (short_code, original_url, expires_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (short_code) DO NOTHING`,
          [shortCode, url, expiresAt]
        );
      }

      // Cache the mapping for fast redirects (TTL = expiresIn or 1 hour)
      const cacheTtl = expiresIn || 3600;
      await set(`url:${shortCode}`, url, cacheTtl);

      const host = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
      return reply.status(201).send({
        shortCode,
        shortUrl: `${host}/r/${shortCode}`,
        originalUrl: url,
        expiresAt: expiresAt || null,
      });
    } catch (err) {
      fastify.log.error(err, 'POST /shorten failed');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /r/:shortCode — Redirect to original URL
  // ---------------------------------------------------------------------------
  fastify.get('/r/:shortCode', async (request, reply) => {
    try {
      const { shortCode } = request.params;

      // 1. Check Redis cache first (fast path)
      let originalUrl = await get(`url:${shortCode}`);

      if (!originalUrl) {
        // 2. Cache miss — check database
        let row = null;
        if (fastify.useMemoryDB()) {
          row = memDbMap.get(shortCode);
        } else {
          const result = await db.query(
            `SELECT original_url, expires_at FROM urls WHERE short_code = $1`,
            [shortCode]
          );
          if (result.rows.length > 0) {
            row = result.rows[0];
          }
        }

        if (!row) {
          return reply.status(404).send({ error: 'Short URL not found' });
        }

        // Check expiry
        if (row.expires_at && new Date(row.expires_at) < new Date()) {
          return reply.status(410).send({ error: 'Short URL has expired' });
        }

        originalUrl = row.original_url;

        // Re-populate cache
        await set(`url:${shortCode}`, originalUrl, 3600);
      }

      // Track the click asynchronously — do not block redirect
      trackClick(shortCode).catch((err) =>
        fastify.log.error(err, 'trackClick failed')
      );

      // Also increment DB click count asynchronously
      if (fastify.useMemoryDB()) {
        const row = memDbMap.get(shortCode);
        if (row) {
          row.click_count++;
          memDbMap.set(shortCode, row);
        }
      } else {
        db.query('UPDATE urls SET click_count = click_count + 1 WHERE short_code = $1', [shortCode])
          .catch((err) => fastify.log.error(err, 'DB click_count increment failed'));
      }

      originalUrl = originalUrl.trim();
      return reply.redirect(302, originalUrl);
    } catch (err) {
      fastify.log.error(err, 'GET /r/:shortCode failed');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /analytics/:shortCode — Get click analytics
  // ---------------------------------------------------------------------------
  fastify.get('/analytics/:shortCode', async (request, reply) => {
    try {
      const { shortCode } = request.params;

      let row = null;
      if (fastify.useMemoryDB()) {
        row = memDbMap.get(shortCode);
      } else {
        const dbResult = await db.query(
          'SELECT short_code, original_url, created_at, expires_at, click_count FROM urls WHERE short_code = $1',
          [shortCode]
        );
        if (dbResult.rows.length > 0) {
          row = dbResult.rows[0];
        }
      }

      if (!row) {
        return reply.status(404).send({ error: 'Short URL not found' });
      }

      // Fetch Redis click stats
      const redisAnalytics = await getAnalytics(shortCode);

      return reply.send({
        shortCode: row.short_code || row.short_code,
        originalUrl: row.original_url,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        dbClickCount: row.click_count,
        realtimeClicks: redisAnalytics.clicks,
        lastClicked: redisAnalytics.lastClicked,
      });
    } catch (err) {
      fastify.log.error(err, 'GET /analytics/:shortCode failed');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /urls — List all URLs (paginated)
  // ---------------------------------------------------------------------------
  fastify.get('/urls', async (request, reply) => {
    try {
      const page = Math.max(1, parseInt(request.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(request.query.limit) || 20));
      const offset = (page - 1) * limit;

      let urlsList = [];
      let total = 0;

      if (fastify.useMemoryDB()) {
        const allItems = Array.from(memDbMap.values())
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        total = allItems.length;
        urlsList = allItems.slice(offset, offset + limit);
      } else {
        const [urlsResult, countResult] = await Promise.all([
          db.query(
            `SELECT id, short_code, original_url, created_at, expires_at, click_count
             FROM urls
             ORDER BY created_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
          ),
          db.query('SELECT COUNT(*) AS total FROM urls'),
        ]);
        urlsList = urlsResult.rows;
        total = parseInt(countResult.rows[0].total);
      }

      return reply.send({
        urls: urlsList,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      });
    } catch (err) {
      fastify.log.error(err, 'GET /urls failed');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // DELETE /urls/:shortCode — Remove a short URL
  // ---------------------------------------------------------------------------
  fastify.delete('/urls/:shortCode', async (request, reply) => {
    try {
      const { shortCode } = request.params;
      let deletedCode = null;

      if (fastify.useMemoryDB()) {
        if (memDbMap.has(shortCode)) {
          deletedCode = shortCode;
          memDbMap.delete(shortCode);
        }
      } else {
        const result = await db.query(
          'DELETE FROM urls WHERE short_code = $1 RETURNING short_code',
          [shortCode]
        );
        if (result.rows.length > 0) {
          deletedCode = result.rows[0].short_code;
        }
      }

      if (!deletedCode) {
        return reply.status(404).send({ error: 'Short URL not found' });
      }

      // Remove from Redis cache and analytics
      await Promise.all([
        del(`url:${shortCode}`),
        del(`analytics:${shortCode}`),
      ]);

      return reply.send({ deleted: true, shortCode });
    } catch (err) {
      fastify.log.error(err, 'DELETE /urls/:shortCode failed');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}
