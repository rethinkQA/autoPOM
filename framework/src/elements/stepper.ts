import { By, type Scope } from "../by.js";
import type { ActionOptions } from "../handler-types.js";
import type { ElementOptions } from "./types.js";
import { buildElement, type BaseElement } from "./base.js";
import { wrapElement } from "../wrap-element.js";

export interface StepperOptions extends ElementOptions {
  /** Accessible name for the increment button. @default "Increase quantity" */
  incrementLabel?: string;
  /** Accessible name for the decrement button. @default "Decrease quantity" */
  decrementLabel?: string;
  /**
   * Strategy for locating the numeric input inside the stepper container.
   *
   * The `by` argument passed to `stepper()` should point to the **container**
   * element that wraps the input and its increment / decrement buttons.
   * `inputBy` tells the stepper how to find the `<input>` within that container.
   *
   * @default By.role("spinbutton")
   */
  inputBy?: By;
}

export interface StepperElement extends BaseElement<StepperElement> {
  increment(options?: ActionOptions): Promise<void>;
  decrement(options?: ActionOptions): Promise<void>;
  read(options?: ActionOptions): Promise<number>;
  set(value: number, options?: StepperSetOptions): Promise<void>;
  isMinDisabled(options?: ActionOptions): Promise<boolean>;
  isMaxDisabled(options?: ActionOptions): Promise<boolean>;
}

export interface StepperSetOptions extends ActionOptions {
  /** Strategy for setting the value. @default "click" */
  strategy?: "fill" | "click";
}

export function stepper(by: By, scope: Scope, options?: StepperOptions): StepperElement {
  const { loc, t, base, ctx, meta } = buildElement<StepperElement>(by, scope, options,
    (ms) => stepper(by, scope, { ...options, timeout: ms }));

  const incLabel = options?.incrementLabel ?? "Increase quantity";
  const decLabel = options?.decrementLabel ?? "Decrease quantity";
  const inputBy = options?.inputBy ?? By.role("spinbutton");

  // `loc()` resolves to the stepper **container** — the element that wraps
  // both the numeric input and the increment / decrement buttons.
  // Sub-elements are located within that container, so no fragile parent
  // traversal ("..") is needed regardless of how deeply the input is nested.
  const input = async () => inputBy.resolve(await loc());
  const incrementBtn = async () =>
    (await loc()).getByRole("button", { name: incLabel });
  const decrementBtn = async () =>
    (await loc()).getByRole("button", { name: decLabel });

  // Build the element object. Methods that call sibling methods use
  // the `wrapped` reference (captured after wrapElement) instead of
  // `this` to avoid reliance on the fn.apply(wrapped, args) binding
  // inside wrapElement. This makes destructuring safe:
  //   const { set } = el;  // works in strict mode
  let wrapped: StepperElement;

  wrapped = wrapElement("stepper", {
    ...base,
    async increment(opts?: ActionOptions) {
      await (await incrementBtn()).click({ timeout: t(opts) });
    },
    async decrement(opts?: ActionOptions) {
      await (await decrementBtn()).click({ timeout: t(opts) });
    },
    async read(opts?: ActionOptions) {
      const value = await (await input()).inputValue({ timeout: t(opts) });
      const n = Number(value);
      if (Number.isNaN(n)) {
        throw new Error(`stepper.read(): input value "${value}" is not a valid number`);
      }
      return n;
    },
    async set(target: number, opts?: StepperSetOptions) {
      if (!Number.isFinite(target)) {
        throw new RangeError(
          `stepper.set(): target must be a finite number, got ${target}`,
        );
      }
      const strategy = opts?.strategy ?? "click";

      if (strategy === "fill") {
        const el = await input();
        const isReadonly = await el.evaluate(
          (node) => (node as HTMLInputElement).readOnly || node.hasAttribute("readonly"),
        );

        if (!isReadonly) {
          // Non-readonly: Playwright's fill() handles framework bindings correctly.
          await el.fill(String(target), { timeout: t(opts) });
          return;
        }

        // Readonly input: direct DOM mutation won't update framework state
        // (React, Vue, Angular, Svelte, Lit all bind values one-way from state).
        // Fall through to click strategy which interacts via the +/- buttons.
      }

      // Delegates to the wrapped read/increment/decrement methods.
      // Uses `wrapped` (closure variable) instead of `this` so that
      // destructured methods (const { set } = el) work in strict mode.
      const current = await wrapped.read(opts);
      const diff = target - current;
      const clicks = Math.abs(diff);
      if (diff > 0) {
        for (let i = 0; i < clicks; i++) await wrapped.increment(opts);
      } else if (diff < 0) {
        for (let i = 0; i < clicks; i++) await wrapped.decrement(opts);
      }

      // Post-loop verification: ensure the stepper actually reached the
      // target value.  Clicks can silently no-op at min/max bounds, with
      // non-unit step sizes, or under UI lag.
      if (clicks > 0) {
        const actual = await wrapped.read(opts);
        if (actual !== target) {
          throw new Error(
            `stepper.set(): expected value ${target} but stepper reads ${actual} ` +
            `after ${clicks} ${diff > 0 ? "increment" : "decrement"} click(s) — ` +
            `possible min/max bound reached or non-unit step size`,
          );
        }
      }
    },
    async isMinDisabled(opts?: ActionOptions) {
      return (await decrementBtn()).isDisabled({ timeout: t(opts) });
    },
    async isMaxDisabled(opts?: ActionOptions) {
      return (await incrementBtn()).isDisabled({ timeout: t(opts) });
    },
  }, ctx, ["increment", "decrement", "read", "set", "isMinDisabled", "isMaxDisabled"], meta);

  return wrapped;
}
