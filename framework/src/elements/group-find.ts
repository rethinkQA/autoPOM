/**
 * Group `find()` combinator — narrows from multiple matching
 * containers to the one containing a specific text.
 *
 * Extracted from group.ts as a standalone composition piece.
 */

import { ElementNotFoundError, AmbiguousMatchError } from "../errors.js";
import type { GroupElement, GroupMethodDeps, BuildGroupFn } from "./group-types.js";
import type { ActionOptions } from "../handler-types.js";

/**
 * Create the `find` method for a GroupElement.
 *
 * Filters the current container locator by exact text content,
 * validates that exactly one match exists, and returns a new
 * GroupElement scoped to that filtered container.
 */
export function createGroupFind(
  deps: GroupMethodDeps,
  buildGroup: BuildGroupFn,
): (text: string, options?: ActionOptions) => Promise<GroupElement> {
  return async function find(text: string, options?: ActionOptions): Promise<GroupElement> {
    const timeout = options?.timeout;
    const container = await deps.loc();
    const filtered = container.filter({
      has: container.page().getByText(text, { exact: true }),
    });

    const count = await filtered.count();
    if (count === 0) {
      throw new ElementNotFoundError(
        `group.find(): No container matched text "${text}". ` +
        `Tried: filter(has: getByText(exact: true)).`,
        {
          query: text,
          triedStrategies: ["filter(has: getByText(exact: true))"],
          container: "group.find()",
        },
      );
    }
    if (count > 1) {
      throw new AmbiguousMatchError(
        `group.find(): Ambiguous match — ${count} containers matched text "${text}". ` +
        `Expected exactly 1.`,
        {
          query: text,
          matchCount: count,
          strategy: "filter(has: getByText(exact: true))",
        },
      );
    }

    if ((await container.count()) === 1) {
      deps.ctx.logger.getLogger().debug(
        `[group.find] The container locator matches only 1 element. ` +
        `find() is designed to narrow from multiple containers to one. ` +
        `At this scope, it will always return the same element if the text exists anywhere inside it. ` +
        `Consider scoping the group to a more specific container first.`,
      );
    }

    const scoped = filtered.first();
    return buildGroup(
      () => scoped,
      deps.defaultTimeout,
      new Map(deps.handlerOverrides),
      deps.ctx,
      `${deps.byDescriptor ?? "group"}.find("${text}")`,
    );
  };
}
