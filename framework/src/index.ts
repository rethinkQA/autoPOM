/**
 * Public consumer API — the "write a test" surface.
 *
 * This is the primary entry point for test authors.  It exports
 * element factories, locator strategies, configuration helpers,
 * error types, and context isolation primitives.
 *
 * For the "extend the framework" surface (custom handlers,
 * middleware, element building blocks), import from
 * `"@playwright-elements/core/extend"` instead.
 *
 * For the Playwright test fixture (automatic context setup/teardown),
 * import from `"@playwright-elements/core/test-fixture"`.
 *
 * For low-level implementation access (no semver guarantees),
 * import from `"@playwright-elements/core/internals"`.
 */

// ── Core identification ─────────────────────────────────────

export { By } from "./by.js";
export type { Scope } from "./by.js";

// ── Structured errors ───────────────────────────────────────

export {
  ElementNotFoundError,
  AmbiguousMatchError,
  ColumnNotFoundError,
  NoHandlerMatchError,
} from "./errors.js";

export type {
  ElementNotFoundContext,
  AmbiguousMatchContext,
  ColumnNotFoundContext,
  NoHandlerMatchContext,
} from "./errors.js";

// ── Observable logger ───────────────────────────────────────

export { configureLogger } from "./defaults.js";
export type { Logger } from "./types.js";

// ── Typed element wrappers ──────────────────────────────────

export {
  checkbox,
  select,
  button,
  text,
  textInput,
  table,
  stepper,
  datePicker,
  radio,
  dialog,
  toast,
  group,
  asString,
  asNumber,
  asBoolean,
  asStringArray,
  nativeDatePickerAdapter,
  nativeSelectAdapter,
  defaultTableAdapter,
} from "./elements/index.js";

export {
  genericNonEditableSelectAdapter,
  editableSelectAdapter,
} from "./adapters/index.js";

// ── Resolve-retry configuration ─────────────────────────────

export {
  configureResolveRetry,
  resetResolveRetry,
} from "./defaults.js";

// ── Timeout/retry configuration ─────────────────────────────

export { resetTimeouts, getTimeouts, removeTimeoutOverride } from "./timeouts.js";
export { configureTimeoutsGuarded as configureTimeouts } from "./defaults.js";
export type { TimeoutConfig } from "./timeouts.js";

// ── Re-export element interfaces ────────────────────────────

export type {
  CheckboxElement,
  SelectElement,
  SelectAdapter,
  SelectOptions,
  ButtonElement,
  TextElement,
  TextInputElement,
  TableElement,
  TableRow,
  TableRowElement,
  TableAdapter,
  TableOptions,
  FindRowOptions,
  StepperElement,
  StepperOptions,
  StepperSetOptions,
  DatePickerElement,
  DatePickerAdapter,
  DatePickerOptions,
  RadioElement,
  DialogElement,
  DialogOptions,
  ToastElement,
  GroupElement,
  FieldValues,
  ActionOptions,
  LabelActionOptions,
  ElementOptions,
  BaseElement,
} from "./elements/index.js";

// ── Framework context (parallel-safe test isolation) ────────

export {
  createFrameworkContext,
  defaultContext,
  getActiveContext,
  runWithContext,
  setStrictContextMode,
  setFallbackContext,
  peekContextStore,
  resetWarningState,
} from "./context.js";
export type { IFrameworkContext } from "./types.js";

// ── Standalone retry utility ────────────────────────────────

export { retryUntil } from "./retry.js";
export type { RetryOptions, RetryResult } from "./retry.js";

// ── Technology-specific adapters ────────────────────────────

export {
  reactDatePickerAdapter,
  vueDatePickerAdapter,
  createVueDatePickerAdapter,
  matDatePickerAdapter,
  createMatDatePickerAdapter,
  flatpickrAdapter,
  createFlatpickrAdapter,
} from "./adapters/index.js";

// ── Network traffic capture ─────────────────────────────────

export { captureTraffic } from "./capture-traffic.js";
export type {
  CapturedRequest,
  CapturedTraffic,
  CaptureTrafficOptions,
} from "./capture-traffic.js";
