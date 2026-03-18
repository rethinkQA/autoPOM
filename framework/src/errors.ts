/**
 * Structured error classes for the framework.
 *
 * Each error carries machine-readable context (query, tried strategies,
 * match count, available columns, etc.) so test failures are immediately
 * actionable without re-running with debug logging.
 */

// ── ElementNotFoundError ────────────────────────────────────────────

export interface ElementNotFoundContext {
  /** The label, text, or query that was searched for. */
  query: string;
  /** Strategies / roles / selectors that were attempted. */
  triedStrategies?: string[];
  /** Optional additional context about where the search was performed. */
  container?: string;
}

/**
 * Thrown when no element matches the given query after exhausting all
 * resolution strategies.
 */
export class ElementNotFoundError extends Error {
  readonly query: string;
  readonly triedStrategies: string[];
  readonly container?: string;

  constructor(message: string, context: ElementNotFoundContext, options?: ErrorOptions) {
    super(message, options);
    this.name = "ElementNotFoundError";
    this.query = context.query;
    this.triedStrategies = context.triedStrategies ?? [];
    this.container = context.container;
  }
}

// ── AmbiguousMatchError ─────────────────────────────────────────────

export interface AmbiguousMatchContext {
  /** The label or text that produced multiple matches. */
  query: string;
  /** How many elements matched. */
  matchCount: number;
  /** The strategy or role that produced the ambiguous result. */
  strategy?: string;
}

/**
 * Thrown when a lookup expected exactly one element but found multiple.
 */
export class AmbiguousMatchError extends Error {
  readonly query: string;
  readonly matchCount: number;
  readonly strategy?: string;

  constructor(message: string, context: AmbiguousMatchContext, options?: ErrorOptions) {
    super(message, options);
    this.name = "AmbiguousMatchError";
    this.query = context.query;
    this.matchCount = context.matchCount;
    this.strategy = context.strategy;
  }
}

// ── ColumnNotFoundError ─────────────────────────────────────────────

export interface ColumnNotFoundContext {
  /** The column name that was requested. */
  column: string;
  /** Column names that are available in the table. */
  availableColumns: string[];
}

/**
 * Thrown when a table operation references a column that does not exist.
 */
export class ColumnNotFoundError extends Error {
  readonly column: string;
  readonly availableColumns: string[];

  constructor(message: string, context: ColumnNotFoundContext, options?: ErrorOptions) {
    super(message, options);
    this.name = "ColumnNotFoundError";
    this.column = context.column;
    this.availableColumns = context.availableColumns;
  }
}

// ── NoHandlerMatchError ─────────────────────────────────────────────

export interface NoHandlerMatchContext {
  /** The tag name of the unmatched element. */
  tag: string;
  /** The role attribute of the unmatched element, if any. */
  role?: string;
}

/**
 * Thrown when {@link HandlerRegistry.detectHandler} cannot find a handler
 * that matches the given DOM element.  This replaces the former silent
 * fallback to the generic input handler, which hid real bugs.
 *
 * To restore the old behaviour pass `{ fallback: true }` to
 * `detectHandler`.
 */
export class NoHandlerMatchError extends Error {
  readonly tag: string;
  readonly role?: string;

  constructor(message: string, context: NoHandlerMatchContext, options?: ErrorOptions) {
    super(message, options);
    this.name = "NoHandlerMatchError";
    this.tag = context.tag;
    this.role = context.role;
  }
}


