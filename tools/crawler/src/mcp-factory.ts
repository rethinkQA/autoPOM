/**
 * Factory for `McpBrowserController`.
 *
 * Spawns Microsoft's `@playwright/mcp` server over stdio, attaches it to a
 * Chromium instance via CDP, and connects Playwright to the same browser so
 * existing crawler discovery primitives still work.
 *
 * Both `@playwright/mcp` and `@modelcontextprotocol/sdk` are declared as
 * optional dependencies — only resolved at runtime when `--mcp` is requested.
 * Callers who never use MCP do not need them installed.
 */

import { createServer } from "node:net";
import { chromium, type BrowserContext } from "playwright";
import {
  McpBrowserController,
  type IMcpClient,
  type McpToolCall,
  type McpControllerOptions,
} from "./mcp-controller.js";

/** Options for {@link createMcpController}. */
export interface CreateMcpControllerOptions extends McpControllerOptions {
  /** CDP port to use. When omitted, an unused TCP port is picked. */
  cdpPort?: number;

  /** Run Chromium in headless mode (default true). */
  headless?: boolean;

  /** Extra arguments forwarded to the `@playwright/mcp` server CLI. */
  mcpArgs?: string[];

  /** Override the package spec passed to `npx` (default `@playwright/mcp@latest`). */
  mcpPackage?: string;

  /** Override the executable that runs the MCP package (default `npx`). */
  mcpRunner?: string;

  /** Pass additional Chromium launch arguments. */
  chromiumArgs?: string[];

  /**
   * Path to a Playwright `storageState` JSON file. Loaded into the persistent
   * context before MCP attaches via CDP, so cookies / localStorage are
   * available on the very first navigation.
   */
  storageState?: string;

  /** Inject a pre-built MCP client (escape hatch for tests / custom transports). */
  client?: IMcpClient;
}

/** Combined controller + dispose hook returned by {@link createMcpController}. */
export interface McpControllerHandle {
  controller: McpBrowserController;
  dispose(): Promise<void>;
}

/**
 * Boot an MCP-driven browser controller.
 *
 * Architecture: we launch Chromium ourselves with CDP exposed, then create a
 * single context (optionally pre-loaded with `storageState`). When
 * `@playwright/mcp` attaches via `--cdp-endpoint`, it sees that one context
 * and drives the same page we observe — so authenticated runs work because
 * the cookies / localStorage are already loaded before MCP performs any
 * action.
 *
 * The returned `dispose()` shuts down everything in reverse order:
 * MCP client → MCP child process → BrowserContext → Browser.
 */
export async function createMcpController(
  options: CreateMcpControllerOptions = {},
): Promise<McpControllerHandle> {
  const cdpPort = options.cdpPort ?? (await pickUnusedPort());
  const headless = options.headless ?? true;

  // ── 1. Launch Chromium with CDP exposed ──────────────────
  const browser = await chromium.launch({
    headless,
    args: [
      `--remote-debugging-port=${cdpPort}`,
      "--remote-debugging-address=127.0.0.1",
      ...(options.chromiumArgs ?? []),
    ],
  });
  const cdpEndpoint = `http://127.0.0.1:${cdpPort}`;

  // ── 2. Create a single context, pre-loaded with auth if any ──
  let context: BrowserContext;
  try {
    context = options.storageState
      ? await browser.newContext({ storageState: options.storageState })
      : await browser.newContext();
  } catch (err) {
    await browser.close().catch(() => {});
    throw err;
  }
  const page = await context.newPage();

  // ── 3. Start MCP and connect a client ────────────────────
  let client: IMcpClient;
  try {
    if (options.client) {
      client = options.client;
    } else {
      client = await spawnMcpClient({
        cdpEndpoint,
        mcpArgs: options.mcpArgs,
        mcpPackage: options.mcpPackage ?? "@playwright/mcp@latest",
        mcpRunner: options.mcpRunner ?? "npx",
      });
    }
  } catch (err) {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    throw err;
  }

  const controller = new McpBrowserController(page, client, {
    settleMs: options.settleMs,
  });

  return {
    controller,
    dispose: async () => {
      // controller.dispose() closes the SDK client, which in turn closes the
      // stdio transport and terminates the spawned MCP child process.
      await controller.dispose();
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    },
  };
}

// ── Internal helpers ────────────────────────────────────────

interface SpawnMcpOptions {
  cdpEndpoint: string;
  mcpArgs?: string[];
  mcpPackage: string;
  mcpRunner: string;
}

async function spawnMcpClient(opts: SpawnMcpOptions): Promise<IMcpClient> {
  const { Client, StdioClientTransport } = await loadMcpSdk();

  const args = [
    "-y",
    opts.mcpPackage,
    "--cdp-endpoint",
    opts.cdpEndpoint,
    ...(opts.mcpArgs ?? []),
  ];

  const transport = new StdioClientTransport({
    command: opts.mcpRunner,
    args,
    stderr: "inherit",
  });

  const sdkClient = new Client(
    { name: "@playwright-elements/crawler", version: "0.1.0" },
    { capabilities: {} },
  );
  await sdkClient.connect(transport);

  return {
    async callTool(call: McpToolCall): Promise<unknown> {
      const response = await sdkClient.callTool({
        name: call.name,
        arguments: call.arguments,
      });
      if (isErrorResponse(response)) {
        throw new Error(extractErrorMessage(response, call.name));
      }
      return response;
    },
    async close(): Promise<void> {
      await sdkClient.close().catch(() => {});
    },
  };
}

interface McpSdk {
  Client: typeof import("@modelcontextprotocol/sdk/client/index.js").Client;
  StdioClientTransport: typeof import("@modelcontextprotocol/sdk/client/stdio.js").StdioClientTransport;
}

async function loadMcpSdk(): Promise<McpSdk> {
  try {
    const [clientModule, stdioModule] = await Promise.all([
      import("@modelcontextprotocol/sdk/client/index.js"),
      import("@modelcontextprotocol/sdk/client/stdio.js"),
    ]);
    return {
      Client: clientModule.Client,
      StdioClientTransport: stdioModule.StdioClientTransport,
    };
  } catch (err) {
    throw new Error(
      "MCP support requires `@modelcontextprotocol/sdk` and `@playwright/mcp` to be installed. " +
        "Install them with: npm install --save-optional @modelcontextprotocol/sdk @playwright/mcp\n" +
        `(original error: ${(err as Error).message})`,
    );
  }
}

function isErrorResponse(response: unknown): boolean {
  return Boolean(
    response && typeof response === "object" && (response as { isError?: boolean }).isError === true,
  );
}

function extractErrorMessage(response: unknown, tool: string): string {
  const obj = response as { content?: Array<{ text?: string }> };
  const text = obj.content?.map((c) => c.text ?? "").filter(Boolean).join("\n");
  return text ? `${tool} failed: ${text}` : `${tool} failed`;
}

function pickUnusedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("could not determine ephemeral port"));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}
