import { redis } from './cacheService.js';

const memAnalytics = new Map();

/**
 * Records a click event for a short code.
 * Uses a Redis hash keyed by analytics:{shortCode} to track:
 *   - clicks: total number of redirects
 *   - last_clicked: Unix timestamp of the most recent click
 *
 * @param {string} shortCode
 * @returns {Promise<void>}
 */
export async function trackClick(shortCode) {
  try {
    const key = `analytics:${shortCode}`;
    await redis.hincrby(key, 'clicks', 1);
    await redis.hset(key, 'last_clicked', Date.now());
  } catch (err) {
    const data = memAnalytics.get(shortCode) || { clicks: 0, last_clicked: null };
    data.clicks++;
    data.last_clicked = Date.now();
    memAnalytics.set(shortCode, data);
  }
}

/**
 * Retrieves click analytics for a short code from Redis.
 *
 * @param {string} shortCode
 * @returns {Promise<{ clicks: number, lastClicked: Date|null }>}
 */
export async function getAnalytics(shortCode) {
  try {
    const key = `analytics:${shortCode}`;
    const data = await redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) {
      const memData = memAnalytics.get(shortCode);
      if (memData) {
        return {
          clicks: memData.clicks,
          lastClicked: new Date(memData.last_clicked),
        };
      }
      return { clicks: 0, lastClicked: null };
    }

    return {
      clicks: Number(data.clicks) || 0,
      lastClicked: data.last_clicked ? new Date(Number(data.last_clicked)) : null,
    };
  } catch (err) {
    const memData = memAnalytics.get(shortCode) || { clicks: 0, last_clicked: null };
    return {
      clicks: memData.clicks,
      lastClicked: memData.last_clicked ? new Date(memData.last_clicked) : null,
    };
  }
}
