import { Worker } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // Required by BullMQ
  retryStrategy: (times) => Math.min(times * 100, 3000),
});

const PROCESSING_STEPS = [
  { name: 'downloading', weight: 0.2 },
  { name: 'decoding', weight: 0.1 },
  { name: 'resizing', weight: 0.3 },
  { name: 'compressing', weight: 0.25 },
  { name: 'uploading', weight: 0.15 },
];

/**
 * Starts the image processing worker.
 *
 * Processes jobs from the 'image-queue' with concurrency of 2.
 * Simulates multi-step image processing pipeline with granular progress updates.
 * 5% failure rate to demonstrate retry behaviour.
 *
 * @returns {Worker} The BullMQ worker instance
 */
export function startImageWorker() {
  const worker = new Worker(
    'image-queue',
    async (job) => {
      const { filename, operation = 'resize' } = job.data;
      console.log(`[Image Worker] Job ${job.id} | File: ${filename} | Op: ${operation}`);

      const totalTime = Math.random() * 3000 + 1000;
      let accumulatedProgress = 0;

      // Execute each processing step sequentially
      for (const step of PROCESSING_STEPS) {
        const stepTime = totalTime * step.weight;

        await new Promise((r) => setTimeout(r, stepTime));

        accumulatedProgress += step.weight * 100;

        await job.updateProgress({
          step: step.name,
          percent: Math.round(accumulatedProgress),
          filename,
          operation,
        });

        console.log(`[Image Worker] Job ${job.id} | Step: ${step.name} | ${Math.round(accumulatedProgress)}%`);
      }

      // 5% failure rate — demonstrates graceful error + retry
      if (Math.random() < 0.05) {
        throw new Error(`Processing failed: corrupt or unsupported file format — ${filename}`);
      }

      const inputSize = Math.floor(Math.random() * 5000) + 500;
      const outputSize = Math.floor(inputSize * (operation === 'compress' ? 0.3 : 0.7));

      const result = {
        processed: true,
        filename,
        operation,
        inputSize: `${inputSize}KB`,
        outputSize: `${outputSize}KB`,
        compressionRatio: parseFloat((1 - outputSize / inputSize).toFixed(2)),
        durationMs: Math.round(totalTime),
        timestamp: new Date().toISOString(),
      };

      console.log(`[Image Worker] ✅ Job ${job.id} completed | ${inputSize}KB → ${outputSize}KB`);
      return result;
    },
    {
      connection,
      concurrency: 2,
      lockDuration: 60000, // Image processing can take longer
    }
  );

  worker.on('progress', (job, progress) => {
    console.log(`[Image] Job ${job.id} @ ${JSON.stringify(progress)}`);
  });

  worker.on('completed', (job, result) => {
    console.log(`[Image] ✅ Job ${job.id} done | Ratio: ${result.compressionRatio}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Image] ❌ Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
  });

  worker.on('error', (err) => {
    console.error('[Image Worker] Error:', err.message);
  });

  console.log('[Image Worker] Started with concurrency: 2');
  return worker;
}
