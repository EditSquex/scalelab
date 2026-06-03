import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Queue, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import {
  DEFAULT_JOB_OPTIONS,
  JOB_PRIORITIES,
  SAMPLE_EMAIL_SUBJECTS,
  SAMPLE_IMAGE_FILES,
} from './jobs/jobDefinitions.js';
import { startEmailWorker } from './workers/emailWorker.js';
import { startImageWorker } from './workers/imageWorker.js';

// ---------------------------------------------------------------------------
// Fastify instance
// ---------------------------------------------------------------------------
const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

// ---------------------------------------------------------------------------
// Redis connection (shared for queues)
// ---------------------------------------------------------------------------
const redisConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 100, 3000),
});

redisConnection.on('error', (err) =>
  fastify.log.error('[Redis]', err.message)
);

// ---------------------------------------------------------------------------
// BullMQ Queues
// ---------------------------------------------------------------------------
const emailQueue = new Queue('email-queue', {
  connection: redisConnection,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

const imageQueue = new Queue('image-queue', {
  connection: redisConnection,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

// ---------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------
await fastify.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
});

// ---------------------------------------------------------------------------
// Helper: map priority string → BullMQ priority number
// ---------------------------------------------------------------------------
function resolvePriority(priority) {
  if (typeof priority === 'number') return priority;
  const map = {
    critical: JOB_PRIORITIES.CRITICAL,
    high: JOB_PRIORITIES.HIGH,
    normal: JOB_PRIORITIES.NORMAL,
    low: JOB_PRIORITIES.LOW,
  };
  return map[String(priority).toLowerCase()] || JOB_PRIORITIES.NORMAL;
}

// ---------------------------------------------------------------------------
// Helper: get comprehensive job state
// ---------------------------------------------------------------------------
async function getJobDetails(queue, jobId) {
  const job = await queue.getJob(jobId);
  if (!job) return null;

  const state = await job.getState();

  return {
    id: job.id,
    name: job.name,
    data: job.data,
    state,
    progress: job.progress,
    attemptsMade: job.attemptsMade,
    maxAttempts: job.opts.attempts,
    priority: job.opts.priority,
    createdAt: new Date(job.timestamp).toISOString(),
    processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
    finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    result: job.returnvalue ?? null,
    failedReason: job.failedReason ?? null,
    delay: job.opts.delay ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * POST /api/jobs/email
 * Enqueue an email send job.
 */
fastify.post('/api/jobs/email', {
  schema: {
    body: {
      type: 'object',
      required: ['to', 'subject'],
      properties: {
        to: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string' },
        priority: {},
        delay: { type: 'number', minimum: 0 },
      },
    },
  },
}, async (request, reply) => {
  try {
    const { to, subject, body = '', priority, delay = 0 } = request.body;

    const job = await emailQueue.add(
      'send-email',
      { to, subject, body },
      {
        ...DEFAULT_JOB_OPTIONS,
        priority: resolvePriority(priority),
        delay,
      }
    );

    // Estimate queue position
    const waiting = await emailQueue.getWaitingCount();

    return reply.status(202).send({
      jobId: job.id,
      queue: 'email-queue',
      status: 'queued',
      queuePosition: waiting,
      priority: job.opts.priority,
    });
  } catch (err) {
    fastify.log.error(err, 'POST /api/jobs/email failed');
    return reply.status(500).send({ error: 'Failed to enqueue email job' });
  }
});

/**
 * POST /api/jobs/image
 * Enqueue an image processing job.
 */
fastify.post('/api/jobs/image', {
  schema: {
    body: {
      type: 'object',
      required: ['filename'],
      properties: {
        filename: { type: 'string' },
        operation: { type: 'string', enum: ['resize', 'compress', 'convert'] },
        priority: {},
        delay: { type: 'number', minimum: 0 },
      },
    },
  },
}, async (request, reply) => {
  try {
    const { filename, operation = 'resize', priority, delay = 0 } = request.body;

    const job = await imageQueue.add(
      'process-image',
      { filename, operation },
      {
        ...DEFAULT_JOB_OPTIONS,
        priority: resolvePriority(priority),
        delay,
      }
    );

    return reply.status(202).send({
      jobId: job.id,
      queue: 'image-queue',
      status: 'queued',
      priority: job.opts.priority,
    });
  } catch (err) {
    fastify.log.error(err, 'POST /api/jobs/image failed');
    return reply.status(500).send({ error: 'Failed to enqueue image job' });
  }
});

/**
 * GET /api/jobs/:jobId
 * Get status and result of any job (checks both queues).
 */
fastify.get('/api/jobs/:jobId', async (request, reply) => {
  try {
    const { jobId } = request.params;

    // Check both queues — client doesn't need to know which queue
    let details = await getJobDetails(emailQueue, jobId);
    if (!details) details = await getJobDetails(imageQueue, jobId);

    if (!details) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    return reply.send(details);
  } catch (err) {
    fastify.log.error(err, 'GET /api/jobs/:jobId failed');
    return reply.status(500).send({ error: 'Internal server error' });
  }
});

/**
 * GET /api/queues
 * Returns counts and stats for all queues.
 */
fastify.get('/api/queues', async (request, reply) => {
  try {
    const [
      emailWaiting,
      emailActive,
      emailCompleted,
      emailFailed,
      emailDelayed,
      imageWaiting,
      imageActive,
      imageCompleted,
      imageFailed,
      imageDelayed,
    ] = await Promise.all([
      emailQueue.getWaitingCount(),
      emailQueue.getActiveCount(),
      emailQueue.getCompletedCount(),
      emailQueue.getFailedCount(),
      emailQueue.getDelayedCount(),
      imageQueue.getWaitingCount(),
      imageQueue.getActiveCount(),
      imageQueue.getCompletedCount(),
      imageQueue.getFailedCount(),
      imageQueue.getDelayedCount(),
    ]);

    return reply.send({
      emailQueue: {
        name: 'email-queue',
        waiting: emailWaiting,
        active: emailActive,
        completed: emailCompleted,
        failed: emailFailed,
        delayed: emailDelayed,
        total: emailWaiting + emailActive + emailCompleted + emailFailed + emailDelayed,
      },
      imageQueue: {
        name: 'image-queue',
        waiting: imageWaiting,
        active: imageActive,
        completed: imageCompleted,
        failed: imageFailed,
        delayed: imageDelayed,
        total: imageWaiting + imageActive + imageCompleted + imageFailed + imageDelayed,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    fastify.log.error(err, 'GET /api/queues failed');
    return reply.status(500).send({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/jobs/:jobId
 * Remove a specific job from its queue.
 */
fastify.delete('/api/jobs/:jobId', async (request, reply) => {
  try {
    const { jobId } = request.params;

    let job = await emailQueue.getJob(jobId);
    let queueName = 'email-queue';

    if (!job) {
      job = await imageQueue.getJob(jobId);
      queueName = 'image-queue';
    }

    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    await job.remove();

    return reply.send({ deleted: true, jobId, queue: queueName });
  } catch (err) {
    fastify.log.error(err, 'DELETE /api/jobs/:jobId failed');
    return reply.status(500).send({ error: 'Internal server error' });
  }
});

/**
 * POST /api/jobs/bulk
 * Add N random jobs for demo/testing purposes.
 */
fastify.post('/api/jobs/bulk', {
  schema: {
    body: {
      type: 'object',
      properties: {
        count: { type: 'number', minimum: 1, maximum: 100, default: 10 },
        type: { type: 'string', enum: ['email', 'image', 'mixed'], default: 'mixed' },
      },
    },
  },
}, async (request, reply) => {
  try {
    const { count = 10, type = 'mixed' } = request.body;

    const domains = ['gmail.com', 'yahoo.com', 'company.io', 'example.com', 'test.dev'];
    const operations = ['resize', 'compress', 'convert'];
    const priorityKeys = Object.keys(JOB_PRIORITIES);

    const jobs = [];

    for (let i = 0; i < count; i++) {
      const priorityKey =
        priorityKeys[Math.floor(Math.random() * priorityKeys.length)];
      const priority = JOB_PRIORITIES[priorityKey];
      const useEmail =
        type === 'email' || (type === 'mixed' && Math.random() < 0.5);

      if (useEmail) {
        const to = `user${Math.floor(Math.random() * 9000) + 1000}@${domains[Math.floor(Math.random() * domains.length)]}`;
        const subject =
          SAMPLE_EMAIL_SUBJECTS[
            Math.floor(Math.random() * SAMPLE_EMAIL_SUBJECTS.length)
          ];
        const job = await emailQueue.add(
          'send-email',
          { to, subject, body: `This is a bulk test email #${i + 1}` },
          { ...DEFAULT_JOB_OPTIONS, priority }
        );
        jobs.push({ jobId: job.id, type: 'email', to, subject, priority: priorityKey });
      } else {
        const filename =
          SAMPLE_IMAGE_FILES[
            Math.floor(Math.random() * SAMPLE_IMAGE_FILES.length)
          ];
        const operation =
          operations[Math.floor(Math.random() * operations.length)];
        const job = await imageQueue.add(
          'process-image',
          { filename, operation },
          { ...DEFAULT_JOB_OPTIONS, priority }
        );
        jobs.push({ jobId: job.id, type: 'image', filename, operation, priority: priorityKey });
      }
    }

    return reply.status(202).send({
      enqueued: jobs.length,
      jobs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    fastify.log.error(err, 'POST /api/jobs/bulk failed');
    return reply.status(500).send({ error: 'Failed to enqueue bulk jobs' });
  }
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
fastify.get('/health', async (request, reply) => {
  let redisOk = false;
  try {
    await redisConnection.ping();
    redisOk = true;
  } catch {
    redisOk = false;
  }

  return reply.status(redisOk ? 200 : 503).send({
    status: redisOk ? 'ok' : 'degraded',
    service: 'job-queue',
    timestamp: new Date().toISOString(),
    dependencies: { redis: redisOk ? 'ok' : 'error' },
  });
});

// ---------------------------------------------------------------------------
// Startup — start workers, then listen
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT) || 3004;
const HOST = process.env.HOST || '0.0.0.0';

try {
  // Start background workers
  const emailWorker = startEmailWorker();
  const imageWorker = startImageWorker();

  // Graceful shutdown
  const shutdown = async () => {
    fastify.log.info('Shutting down workers...');
    await emailWorker.close();
    await imageWorker.close();
    await emailQueue.close();
    await imageQueue.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await fastify.listen({ port: PORT, host: HOST });
  fastify.log.info(`[Job Queue] Listening on http://${HOST}:${PORT}`);
} catch (err) {
  fastify.log.error(err, 'Failed to start Job Queue service');
  process.exit(1);
}
