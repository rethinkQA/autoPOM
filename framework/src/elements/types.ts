/**
 * Common element option types shared across all element factories.
 */
import type { IFrameworkContext } from "../types.js";

/** Base options accepted by every element factory function. */
export interface ElementOptions {
  /** Default timeout (ms) applied to every operation on this element. */
  timeout?: number;
  /** Optional isolated context for handlers/middleware/logger config. */
  context?: IFrameworkContext;
}

// ActionOptions and LabelActionOptions are canonically defined in
// ../handler-types.ts. Element files import directly from there.
