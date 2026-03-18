/**
 * LoggerConfig — manages the injectable logger instance used by the
 * framework to emit warnings and diagnostics.
 *
 * Extracted from {@link FrameworkContext} to follow the single-responsibility
 * principle.
 */

import type { Logger, ILoggerConfig } from "./types.js";

/** Built-in default logger — delegates to console.warn; debug is a no-op. */
const _defaultLogger: Logger = {
  warn: (msg) => console.warn(msg),
  debug: () => {},
  debugEnabled: false,
};

// ── LoggerConfig class ──────────────────────────────────────

export class LoggerConfig implements ILoggerConfig {
  private _logger: Logger;

  constructor() {
    this._logger = { ..._defaultLogger };
  }

  /**
   * Replace the framework's logger.
   *
   * Pass a partial `Logger` to override specific levels (unset levels
   * keep their defaults). Pass `null` to reset to the built-in
   * `console.warn` behaviour.
   */
  configureLogger(logger: Partial<Logger> | null): void {
    if (logger === null) {
      this._logger = { ..._defaultLogger };
    } else {
      this._logger = {
        ..._defaultLogger,
        ...logger,
        // Automatically enable debug probes when a custom debug
        // function is provided, unless the caller explicitly set
        // debugEnabled themselves.
        debugEnabled: logger.debugEnabled ?? (logger.debug !== undefined),
      };
    }
  }

  /** Return the active logger instance. */
  getLogger(): Logger {
    return this._logger;
  }
}
