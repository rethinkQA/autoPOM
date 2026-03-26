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
   *
   * **Implicit debug activation:** Providing a `debug` function
   * implicitly sets `debugEnabled: true` unless you also pass
   * `debugEnabled: false`. This means `configureLogger({ debug: myFn })`
   * immediately enables debug-level logging. To register a debug sink
   * for later dynamic activation, pass both:
   * `configureLogger({ debug: myFn, debugEnabled: false })`.
   */
  configureLogger(logger: Partial<Logger> | null): void {
    if (logger === null) {
      this._logger = { ..._defaultLogger };
    } else {
      // Validate that any provided methods are actually functions,
      // so callers get a clear error at configuration time rather
      // than a cryptic "x is not a function" at call time.
      for (const key of ["warn", "debug"] as const) {
        if (logger[key] !== undefined && typeof logger[key] !== "function") {
          throw new Error(
            `configureLogger: "${key}" must be a function, got ${typeof logger[key]}.`,
          );
        }
      }
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
