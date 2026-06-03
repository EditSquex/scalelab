import { Worker } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // Required by BullMQ
  retryStrategy: (times) => Math.min(times * 100, 3000),
});

/**
 * Starts the email worker.
 *
 * Processes jobs from the 'email-queue' with concurrency of 3.
 * Simulates sending emails with realistic processing time (500ms–2500ms).
 * 10% failure rate to demonstrate BullMQ's exponential backoff retry logic.
 *
 * @returns {Worker} The BullMQ worker instance
 */
export function startEmailWorker() {
  const worker = new Worker(
    'email-queue',
    async (job) => {
      const { to, subject, body = '' } = job.data;
      console.log(`[Email Worker] Job ${job.id} | To: ${to} | Subject: ${subject}`);

      // Update progress: connecting to SMTP
      await job.updateProgress({ stage: 'connecting', percent: 10 });

      const processingTime = Math.random() * 2000 + 500;
      await new Promise((r) => setTimeout(r, processingTime * 0.3));

      // Update progress: authenticating
      await job.updateProgress({ stage: 'authenticating', percent: 30 });
      await new Promise((r) => setTimeout(r, processingTime * 0.2));

      // Update progress: sending
      await job.updateProgress({ stage: 'sending', percent: 60 });
      await new Promise((r) => setTimeout(r, processingTime * 0.3));

      // Simulate 10% transient SMTP failure rate — demonstrates retry
      if (Math.random() < 0.1) {
        throw new Error(`SMTP connection failed for ${to}: connection timeout`);
      }

      await job.updateProgress({ stage: 'delivered', percent: 100 });

      const result = {
        sent: true,
        to,
        subject,
        timestamp: new Date().toISOString(),
        durationMs: Math.round(processingTime),
        messageId: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      };

      console.log(`[Email Worker] ✅ Job ${job.id} completed in ${Math.round(processingTime)}ms`);
      return result;
    },
    {
      connection,
      concurrency: 3,
      // Graceful timeout before forcefully killing a job
      lockDuration: 30000,
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`[Email] ✅ Job ${job.id} done → sent to ${result.to}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Email] ❌ Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
  });

  worker.on('progress', (job, progress) => {
    console.log(`[Email] Job ${job.id} progress: ${JSON.stringify(progress)}`);
  });

  worker.on('error', (err) => {
    console.error('[Email Worker] Error:', err.message);
  });

  console.log('[Email Worker] Started with concurrency: 3');
  return worker;
}
