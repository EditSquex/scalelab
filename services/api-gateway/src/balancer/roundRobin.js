/**
 * Round-Robin Load Balancer
 *
 * Distributes requests evenly across a pool of backends.
 * Tracks per-backend health, request counts, errors, and latencies.
 * Skips unhealthy backends automatically.
 */
class RoundRobinBalancer {
  /**
   * @param {string[]} backends - Array of backend URLs
   */
  constructor(backends) {
    this.backends = backends.map((url) => ({
      url,
      healthy: true,
      requests: 0,
      errors: 0,
      latencies: [], // Rolling window of last 100 latency values (ms)
      lastError: null,
      lastSuccess: null,
    }));

    this.currentIndex = 0;

    this.stats = {
      totalRequests: 0,
      totalErrors: 0,
      startedAt: new Date().toISOString(),
    };
  }

  /**
   * Get the next healthy backend using round-robin.
   * @returns {{ url: string }} The selected backend object
   * @throws {Error} If no healthy backends are available
   */
  next() {
    const healthy = this.backends.filter((b) => b.healthy);

    if (healthy.length === 0) {
      throw new Error('No healthy backends available');
    }

    const backend = healthy[this.currentIndex % healthy.length];
    this.currentIndex = (this.currentIndex + 1) % healthy.length;

    return backend;
  }

  /**
   * Mark a backend as unhealthy (e.g., after a connection failure).
   * @param {string} url
   */
  markUnhealthy(url) {
    const b = this.backends.find((b) => b.url === url);
    if (b) {
      b.healthy = false;
      b.lastError = new Date().toISOString();
      console.warn(`[LoadBalancer] Marked unhealthy: ${url}`);
    }
  }

  /**
   * Mark a backend as healthy again (e.g., after health check passes).
   * @param {string} url
   */
  markHealthy(url) {
    const b = this.backends.find((b) => b.url === url);
    if (b && !b.healthy) {
      b.healthy = true;
      b.lastSuccess = new Date().toISOString();
      console.info(`[LoadBalancer] Marked healthy: ${url}`);
    }
  }

  /**
   * Record the latency of a request to a specific backend.
   * Maintains a rolling window of the last 100 samples.
   * @param {string} url
   * @param {number} latencyMs
   * @param {boolean} isError
   */
  recordLatency(url, latencyMs, isError = false) {
    const b = this.backends.find((b) => b.url === url);
    if (b) {
      b.requests++;
      b.latencies.push(latencyMs);
      if (b.latencies.length > 100) b.latencies.shift();
      if (isError) {
        b.errors++;
        this.stats.totalErrors++;
      } else {
        b.lastSuccess = new Date().toISOString();
      }
    }
    this.stats.totalRequests++;
  }

  /**
   * Get a summary of all backends with computed averages.
   */
  getStats() {
    return {
      backends: this.backends.map((b) => {
        const avgLatency =
          b.latencies.length > 0
            ? Math.round(b.latencies.reduce((a, c) => a + c, 0) / b.latencies.length)
            : 0;

        const p95Latency =
          b.latencies.length > 0
            ? (() => {
                const sorted = [...b.latencies].sort((a, c) => a - c);
                const idx = Math.floor(sorted.length * 0.95);
                return sorted[idx] ?? sorted[sorted.length - 1];
              })()
            : 0;

        return {
          url: b.url,
          healthy: b.healthy,
          requests: b.requests,
          errors: b.errors,
          errorRate: b.requests > 0 ? parseFloat((b.errors / b.requests).toFixed(4)) : 0,
          avgLatencyMs: avgLatency,
          p95LatencyMs: p95Latency,
          lastError: b.lastError,
          lastSuccess: b.lastSuccess,
        };
      }),
      totalRequests: this.stats.totalRequests,
      totalErrors: this.stats.totalErrors,
      healthyCount: this.backends.filter((b) => b.healthy).length,
      totalCount: this.backends.length,
      uptime: new Date().toISOString(),
    };
  }
}

export default RoundRobinBalancer;
