/**
 * Circuit Breaker
 *
 * Prevents cascading failures by stopping requests to unhealthy backends.
 *
 * State machine:
 *   CLOSED   → Normal operation. Requests pass through.
 *              Transitions to OPEN when failureCount >= failureThreshold.
 *
 *   OPEN     → Circuit is tripped. All requests are immediately rejected.
 *              Transitions to HALF_OPEN after `timeout` milliseconds.
 *
 *   HALF_OPEN → Test mode. Allows a limited number of requests.
 *              If successCount >= successThreshold → CLOSED.
 *              If any failure → OPEN.
 */

const STATES = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
};

class CircuitBreaker {
  /**
   * @param {object} options
   * @param {number} options.failureThreshold - Failures before opening (default: 5)
   * @param {number} options.successThreshold - Successes in HALF_OPEN before closing (default: 2)
   * @param {number} options.timeout - ms before attempting recovery (default: 30000)
   * @param {string} options.name - Identifier for logging
   */
  constructor(options = {}) {
    this.name = options.name || 'circuit-breaker';
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 30000;

    this.state = STATES.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;

    this.stats = {
      totalRequests: 0,
      blocked: 0,
      passed: 0,
      failures: 0,
      stateChanges: [],
    };
  }

  // ---------------------------------------------------------------------------
  // State Transitions
  // ---------------------------------------------------------------------------

  _transitionTo(newState) {
    const prev = this.state;
    this.state = newState;
    const change = {
      from: prev,
      to: newState,
      at: new Date().toISOString(),
    };
    this.stats.stateChanges.push(change);

    // Keep only last 20 state changes for the UI
    if (this.stats.stateChanges.length > 20) {
      this.stats.stateChanges.shift();
    }

    console.info(`[CircuitBreaker:${this.name}] ${prev} → ${newState}`);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Checks whether a request is permitted to proceed.
   * Must be called before attempting the upstream request.
   *
   * @returns {boolean} true if request should proceed
   */
  canRequest() {
    this.stats.totalRequests++;

    if (this.state === STATES.CLOSED) {
      this.stats.passed++;
      return true;
    }

    if (this.state === STATES.OPEN) {
      // Check if enough time has passed to attempt recovery
      if (
        this.lastFailureTime &&
        Date.now() - this.lastFailureTime > this.timeout
      ) {
        this._transitionTo(STATES.HALF_OPEN);
        this.stats.passed++;
        return true;
      }

      this.stats.blocked++;
      return false;
    }

    // HALF_OPEN: allow test requests through
    this.stats.passed++;
    return true;
  }

  /**
   * Call this after a successful upstream request.
   */
  onSuccess() {
    this.failureCount = 0;

    if (this.state === STATES.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.successCount = 0;
        this._transitionTo(STATES.CLOSED);
      }
    }
  }

  /**
   * Call this after a failed upstream request.
   */
  onFailure() {
    this.stats.failures++;
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (
      this.state === STATES.HALF_OPEN ||
      this.failureCount >= this.failureThreshold
    ) {
      this.successCount = 0;
      this._transitionTo(STATES.OPEN);
    }
  }

  /**
   * Manually force the circuit into a specific state.
   * Useful for demos and testing.
   * @param {'CLOSED'|'OPEN'|'HALF_OPEN'} state
   */
  forceState(state) {
    if (!STATES[state]) return false;
    this._transitionTo(STATES[state]);
    if (state === 'OPEN') this.lastFailureTime = Date.now();
    this.failureCount = 0;
    this.successCount = 0;
    return true;
  }

  /**
   * Returns the current state and all stats for the dashboard.
   */
  getState() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      failureThreshold: this.failureThreshold,
      successThreshold: this.successThreshold,
      timeoutMs: this.timeout,
      lastFailureTime: this.lastFailureTime
        ? new Date(this.lastFailureTime).toISOString()
        : null,
      nextRetry:
        this.state === STATES.OPEN && this.lastFailureTime
          ? new Date(this.lastFailureTime + this.timeout).toISOString()
          : null,
      stats: {
        totalRequests: this.stats.totalRequests,
        blocked: this.stats.blocked,
        passed: this.stats.passed,
        failures: this.stats.failures,
        blockRate:
          this.stats.totalRequests > 0
            ? parseFloat(
                (this.stats.blocked / this.stats.totalRequests).toFixed(4)
              )
            : 0,
      },
      recentStateChanges: this.stats.stateChanges.slice(-10),
    };
  }
}

export default CircuitBreaker;
