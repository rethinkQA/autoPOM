import { By, type Scope } from "../by.js";
import type { Locator } from "@playwright/test";
import { ElementNotFoundError, ColumnNotFoundError } from "../errors.js";
import type { ActionOptions } from "../handler-types.js";
import type { ElementOptions } from "./types.js";
import { clickInContainer } from "../dom-helpers.js";
import { buildElement, buildElementFromProvider, type BaseElement } from "./base.js";
import { wrapElement } from "../wrap-element.js";
import type { IFrameworkContext } from "../types.js";
import { isTimeoutError } from "../playwright-errors.js";

// ── Table adapter ──────────────────────────────────────────

/**
 * Adapter interface for technology-specific table structures.
 *
 * Tables vary significantly across UI libraries (Material tables,
 * AG Grid, Tanstack Table, etc.).  The adapter maps logical table
 * operations to CSS selectors so the framework can work with any
 * table implementation without forking or raw Playwright code.
 *
 * Implement this interface and pass it via {@link TableOptions.adapter}
 * to support non-standard table markup.
 */
export interface TableAdapter {
  /** Selector for header cells (relative to the table root). Default: `"thead th"` */
  headerCells: string;
  /**
   * Selector for data rows excluding empty-state rows (relative to the table root).
   * Default: `"tbody tr:not(.empty-state)"`
   *
   * **Custom adapters:** This selector is used by `rows()`, `rowCount()`,
   * and `row()` to enumerate data.  It **must** exclude non-data rows
   * (empty-state placeholders, loading spinners, etc.) — the framework
   * does not apply a separate empty-state filter before counting.
   */
  dataRows: string;
  /** Selector for cells within a single row. Default: `"td"` */
  cells: string;
  /** Selector for the empty-state indicator (relative to the table root). Default: `".empty-state"` */
  emptyState: string;
  /** Selector for the table body container (relative to the table root). Default: `"tbody"` */
  body: string;
  /** Selector for all body rows including empty-state (relative to the table root). Default: `"tbody tr"` */
  bodyRows: string;

  /**
   * Optional sort override for component libraries with non-standard sort triggers.
   *
   * When provided, `table.sort(column)` delegates to this method instead of
   * the default "click the `<th>` whose text matches" behaviour.
   *
   * Implement this for libraries where sort is triggered by clicking a nested
   * icon (`<TableSortLabel>`), a header cell with a specific `aria-sort`
   * attribute (`matSort`), or any other non-trivial mechanism.
   *
   * @param tableLocator - The root table locator.
   * @param column       - The column name to sort by (case-insensitive).
   * @param headerIndex  - The 0-based index of the matching column header.
   * @param headerLocator - The locator for the matching `<th>` element.
   * @param options      - Timeout and action options.
   */
  sort?(
    tableLocator: Locator,
    column: string,
    headerIndex: number,
    headerLocator: Locator,
    options?: ActionOptions,
  ): Promise<void>;
}

/** Default adapter for standard HTML `<table>` markup. */
export const defaultTableAdapter: TableAdapter = {
  headerCells: "thead th",
  dataRows: "tbody tr:not(.empty-state)",
  cells: "td",
  emptyState: ".empty-state",
  body: "tbody",
  bodyRows: "tbody tr",
};

/** Options for the {@link table} element factory. */
export interface TableOptions extends ElementOptions {
  /** Override the default HTML table adapter for custom table implementations. */
  adapter?: TableAdapter;
}

/** Options for {@link TableElement.findRow}. */
export interface FindRowOptions extends ActionOptions {
  /**
   * When `true`, cell values must match criteria **exactly**
   * (case-insensitive full-string comparison).
   * When `false` (default), criteria are matched as **case-insensitive substrings**.
   *
   * @default false
   */
  exact?: boolean;
}

/** Strip sort-indicator characters (⇅↑↓▲▼) from header text. */
function cleanHeaderText(raw: string): string {
  return raw.replace(/[⇅↑↓▲▼]/g, "").trim();
}

/**
 * Validate that every key in `criteria` exists in the header map, then
 * build a serialised `[colIndex, expectedLowercase][]` array for row
 * matching.  Throws {@link ColumnNotFoundError} on unknown columns.
 */
function validateAndSerializeCriteria(
  criteria: Record<string, string>,
  headerMap: Map<string, number>,
  originals: string[],
): [number, string][] {
  for (const key of Object.keys(criteria)) {
    if (!headerMap.has(key.toLowerCase())) {
      throw new ColumnNotFoundError(
        `Column "${key}" not found. Available columns: ${originals.join(", ")}`,
        { column: key, availableColumns: [...originals] },
      );
    }
  }
  return Object.entries(criteria).map(
    ([key, expected]) => [headerMap.get(key.toLowerCase())!, expected.toLowerCase()],
  );
}

/**
 * Scan table rows using the locator-based approach (works with Shadow
 * DOM).  Returns the 0-based index of the first matching row, or `-1`.
 *
 * Both {@link table findRow()} and {@link createTableRowElement refresh()}
 * delegate here so the matching algorithm is defined in one place.
 *
 * **Matching semantics:**
 * - `exact: false` (default) — case-insensitive **substring** match.
 *   `findRow({ name: "Mouse" })` matches cells containing "Wireless Mouse".
 * - `exact: true` — case-insensitive **exact** (full-string) match.
 *   Only cells whose trimmed text equals the criterion will match.
 */
async function scanRowsLocator(
  trLocator: Locator,
  serializedCriteria: readonly (readonly [number, string])[],
  cellSelector: string = "td",
  exact: boolean = false,
): Promise<number> {
  const rowCount = await trLocator.count();
  for (let i = 0; i < rowCount; i++) {
    const cellTexts = await trLocator.nth(i).locator(cellSelector).allTextContents();
    const match = serializedCriteria.every(([colIdx, expected]) => {
      const text = (cellTexts[colIdx] ?? "").trim().toLowerCase();
      return exact ? text === expected : text.includes(expected);
    });
    if (match) return i;
  }
  return -1;
}

export interface TableRow {
  [key: string]: string;
}

export interface TableRowElement extends BaseElement<TableRowElement> {
  /** Read the cell text under the named column header. */
  get(header: string, options?: ActionOptions): Promise<string>;
  /** Click a button or link within this row by its visible text. */
  click(text: string, options?: ActionOptions): Promise<void>;
  /**
   * Re-run the original `findRow()` criteria against the current table
   * state, returning a fresh {@link TableRowElement} with an up-to-date
   * positional locator and header map.
   *
   * Use this after sorting, filtering, or otherwise mutating the table
   * when you need to continue working with the same logical row.
   */
  refresh(): Promise<TableRowElement>;
}

export interface TableElement extends BaseElement<TableElement> {
  rows(options?: ActionOptions): Promise<TableRow[]>;
  rowCount(options?: ActionOptions): Promise<number>;
  sort(column: string, options?: ActionOptions): Promise<void>;
  headers(options?: ActionOptions): Promise<string[]>;
  isEmpty(options?: ActionOptions): Promise<boolean>;
  emptyText(options?: ActionOptions): Promise<string>;
  /**
   * Find the first row matching the given column/value criteria.
   *
   * **Matching semantics (default: substring)**
   *
   * By default, cell values are compared using **case-insensitive substring**
   * matching — `findRow({ name: "Mouse" })` matches "Wireless Mouse".
   * Pass `{ exact: true }` for case-insensitive **exact** (full-string)
   * matching when you need to avoid false positives.
   *
   * **Important:** The returned {@link TableRowElement} is backed by a
   * positional locator (`nth(i)` at the time of the call).  If the table is
   * subsequently sorted, filtered, or otherwise mutated, the locator will
   * resolve to whatever row now occupies that position — *not* the original
   * row.  For reliable results, use the returned element immediately and do
   * not store it across table mutations.
   */
  findRow(criteria: Record<string, string>, options?: FindRowOptions): Promise<TableRowElement>;
}

interface HeaderInfo {
  map: Map<string, number>;
  originals: string[];
}

export function table(by: By, scope: Scope, options?: TableOptions): TableElement {
  const { loc, t, base, ctx, meta } = buildElement<TableElement>(by, scope, options,
    (ms) => table(by, scope, { ...options, timeout: ms }));
  const defaultTimeout = options?.timeout;
  const adapter = options?.adapter ?? defaultTableAdapter;

  /**
   * Read headers fresh from the DOM on every call.
   * Avoids stale-cache bugs when columns change between operations
   * (sort, dynamic content, navigation).
   */
  async function readHeaders(options?: ActionOptions): Promise<HeaderInfo> {
    const tableEl = await loc();
    const headerCells = tableEl.locator(adapter.headerCells);
    // Wait for at least one header cell to be attached before reading,
    // matching the pattern used in rows() — Issue 71.
    await headerCells.first().waitFor({ state: "attached", timeout: options?.timeout ?? defaultTimeout });
    const rawTexts = await headerCells.allTextContents();
    const map = new Map<string, number>();
    const originals: string[] = [];
    rawTexts.forEach((text, idx) => {
      const cleaned = cleanHeaderText(text);
      originals.push(cleaned);
      map.set(cleaned.toLowerCase(), idx);
    });
    return { map, originals };
  }

  return wrapElement("table", {
    ...base,
    async rows(options?: ActionOptions) {
      const tableEl = await loc();

      const { originals: headers } = await readHeaders(options);

      const trLocator = tableEl.locator(adapter.dataRows);
      const rowCount = await trLocator.count();
      if (rowCount === 0) return [];

      // Batch all cell text extraction in a single `allTextContents()`
      // call per row using `Promise.all` to eliminate O(N) sequential
      // round-trips (Issue #135).
      const allCellTexts = await Promise.all(
        Array.from({ length: rowCount }, (_, i) =>
          trLocator.nth(i).locator(adapter.cells).allTextContents(),
        ),
      );

      const rows: TableRow[] = [];
      for (let i = 0; i < rowCount; i++) {
        const cellTexts = allCellTexts[i];
        const row: TableRow = {};
        headers.forEach((key, idx) => {
          if (idx < cellTexts.length) {
            row[key] = cellTexts[idx].trim();
          }
        });
        rows.push(row);
      }

      return rows;
    },

    async rowCount(options?: ActionOptions) {
      const timeout = t(options);
      const table = await loc();
      // Wait for the table body to be present before counting.
      await table.locator(adapter.body).waitFor({ state: "attached", timeout });
      // The dataRows selector (default: "tbody tr:not(.empty-state)")
      // already excludes empty-state rows, so no separate empty-state
      // check is needed.  Custom adapters must ensure their dataRows
      // selector likewise excludes non-data rows (see TableAdapter docs).
      return table.locator(adapter.dataRows).count();
    },

    async sort(column: string, options?: ActionOptions) {
      const timeout = t(options);
      const tableEl = await loc();
      // Match <th> by visible text (case-insensitive, ignoring sort indicators)
      const allHeaders = tableEl.locator(adapter.headerCells);
      const count = await allHeaders.count();
      for (let i = 0; i < count; i++) {
        const th = allHeaders.nth(i);
        const text = cleanHeaderText((await th.textContent({ timeout })) ?? "");
        if (text.toLowerCase() === column.toLowerCase()) {
          // Delegate to adapter.sort() when available (component library
          // tables like MUI, Vuetify, Angular Material may need custom
          // sort triggers — Issue #117).
          if (adapter.sort) {
            await adapter.sort(tableEl, column, i, th, { timeout });
          } else {
            await th.click({ timeout });
          }
          return;
        }
      }

      const { originals: available } = await readHeaders(options);
      throw new ColumnNotFoundError(
        `Cannot sort by "${column}": no <th> found matching text. ` +
        `Available columns: ${available.join(", ")}`,
        { column, availableColumns: available },
      );
    },

    async headers(options?: ActionOptions): Promise<string[]> {
      const { originals } = await readHeaders(options);
      return originals;
    },

    async isEmpty(options?: ActionOptions) {
      const timeout = t(options);
      const emptyState = (await loc()).locator(adapter.emptyState);
      if (timeout !== undefined) {
        try {
          await emptyState.first().waitFor({ state: "attached", timeout });
          return true;
        } catch (err) {
          if (isTimeoutError(err)) return false;
          throw err;
        }
      }
      return (await emptyState.count()) > 0;
    },

    async emptyText(options?: ActionOptions) {
      const es = (await loc()).locator(adapter.emptyState);
      if ((await es.count()) === 0) {
        throw new ElementNotFoundError(
          "No empty-state element found — the table may not be empty",
          { query: adapter.emptyState, container: "table.emptyText()" },
        );
      }
      return ((await es.first().textContent({ timeout: t(options) })) ?? "").trim();
    },

    async findRow(criteria: Record<string, string>, options?: FindRowOptions): Promise<TableRowElement> {
      if (Object.keys(criteria).length === 0) {
        throw new Error("findRow: criteria must contain at least one column/value pair.");
      }
      const exact = options?.exact ?? false;
      const { map: headerMap, originals } = await readHeaders(options);
      const serializedCriteria = validateAndSerializeCriteria(criteria, headerMap, originals);

      const tableEl = await loc();
      const trLocator = tableEl.locator(adapter.dataRows);
      const rowCount = await trLocator.count();

      if (rowCount === 0) {
        throw new ElementNotFoundError(
          `No row found matching criteria: ${JSON.stringify(criteria)}`,
          {
            query: JSON.stringify(criteria),
            triedStrategies: ["locator() row scan"],
            container: "table.findRow()",
          },
        );
      }

      // Always use the Locator-based path — works with Shadow DOM and
      // avoids the correctness issues of the evaluate() fast path
      // (Issues 13, 30, 33).
      const matchIdx = await scanRowsLocator(trLocator, serializedCriteria, adapter.cells, exact);
      if (matchIdx !== -1) {
        return createTableRowElement(
          trLocator.nth(matchIdx), readHeaders, criteria, defaultTimeout, ctx, adapter,
          () => loc(), exact,
        );
      }

      throw new ElementNotFoundError(
        `No row found matching criteria: ${JSON.stringify(criteria)}`,
        {
          query: JSON.stringify(criteria),
          triedStrategies: ["locator() row scan"],
          container: "table.findRow()",
        },
      );
    },

  }, ctx, ["rows", "rowCount", "sort", "headers", "isEmpty", "emptyText", "findRow"], meta);
}

function createTableRowElement(
  rowLocator: Locator,
  readHeaders: (options?: ActionOptions) => Promise<HeaderInfo>,
  criteria: Record<string, string>,
  defaultTimeout: number | undefined,
  ctx: IFrameworkContext,
  adapter: TableAdapter = defaultTableAdapter,
  tableLoc?: () => Promise<Locator>,
  exact: boolean = false,
): TableRowElement {
  const { t, base, meta } = buildElementFromProvider<TableRowElement>({
    locProvider: () => rowLocator,
    rebuild: (ms) => createTableRowElement(rowLocator, readHeaders, criteria, ms, ctx, adapter, tableLoc, exact),
    defaultTimeout,
    context: ctx,
    byDescriptor: `tableRow(${JSON.stringify(criteria)})`,
  });

  return wrapElement("tableRow", {
    ...base,
    async get(header: string, options?: ActionOptions) {
      // Re-read headers from the DOM on every call so that column
      // positions are never stale after sorts/filters/mutations.
      const { map: headerMap, originals } = await readHeaders(options);
      const colIdx = headerMap.get(header.toLowerCase());
      if (colIdx === undefined) {
        throw new ColumnNotFoundError(
          `Column "${header}" not found. Available columns: ${originals.join(", ")}`,
          { column: header, availableColumns: [...originals] },
        );
      }
      const cell = rowLocator.locator(adapter.cells).nth(colIdx);
      return ((await cell.textContent({ timeout: t(options) })) ?? "").trim();
    },

    async click(text: string, options?: ActionOptions) {
      await clickInContainer(rowLocator, text, {
        timeout: t(options),
      });
    },

    async refresh(): Promise<TableRowElement> {
      // Re-read fresh headers and validate criteria against them.
      const { map: headerMap, originals } = await readHeaders();
      const serializedCriteria = validateAndSerializeCriteria(criteria, headerMap, originals);

      // Use the captured table locator instead of XPath ancestor traversal
      // (which cannot cross Shadow DOM boundaries — Issue 31).
      if (!tableLoc) {
        throw new Error(
          "tableRow.refresh(): no parent table locator available. " +
          "This row was created without a tableLoc provider.",
        );
      }
      const tableEl = await tableLoc();
      const trLocator = tableEl.locator(adapter.dataRows);

      const matchIdx = await scanRowsLocator(trLocator, serializedCriteria, adapter.cells, exact);
      if (matchIdx !== -1) {
        return createTableRowElement(
          trLocator.nth(matchIdx), readHeaders, criteria, defaultTimeout, ctx, adapter, tableLoc, exact,
        );
      }

      throw new ElementNotFoundError(
        `refresh(): No row found matching criteria: ${JSON.stringify(criteria)}`,
        {
          query: JSON.stringify(criteria),
          triedStrategies: ["locator() row scan"],
          container: "tableRow.refresh()",
        },
      );
    },
  }, ctx, ["get", "click", "refresh"], meta);
}
