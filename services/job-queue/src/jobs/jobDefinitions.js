/**
 * Job type constants, priority levels, and shared default options.
 * Imported by workers and the server to keep configuration centralised.
 */

export const JOB_TYPES = {
  EMAIL: 'email',
  IMAGE_PROCESS: 'image-process',
  DATA_EXPORT: 'data-export',
  NOTIFICATION: 'notification',
};

/** Lower number = higher priority in BullMQ */
export const JOB_PRIORITIES = {
  CRITICAL: 1,
  HIGH: 2,
  NORMAL: 5,
  LOW: 10,
};

/** Default options applied to all enqueued jobs */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000, // 1s → 2s → 4s
  },
  removeOnComplete: { count: 100 }, // Keep last 100 completed jobs
  removeOnFail: { count: 50 },      // Keep last 50 failed jobs for inspection
};

/** Human-readable priority labels for UI display */
export const PRIORITY_LABELS = {
  1: 'CRITICAL',
  2: 'HIGH',
  5: 'NORMAL',
  10: 'LOW',
};

/** Sample email subjects for bulk demo job generation */
export const SAMPLE_EMAIL_SUBJECTS = [
  'Welcome to ScaleLab!',
  'Your account has been verified',
  'Password reset request',
  'Weekly digest report',
  'Your subscription is expiring soon',
  'Invoice #12345 ready for download',
  'New message from support team',
  'System maintenance scheduled',
];

/** Sample filenames for bulk demo image jobs */
export const SAMPLE_IMAGE_FILES = [
  'product-hero.jpg',
  'profile-avatar.png',
  'banner-summer-sale.jpg',
  'thumbnail-course-intro.mp4',
  'logo-transparent.png',
  'bg-landing-page.webp',
  'icon-set-v2.svg',
];
