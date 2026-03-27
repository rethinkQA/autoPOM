/**
 * Mock provider for testing — returns predefined groups.
 * Useful for CI, snapshot tests, and development without an API key.
 */

import type { AiProvider, AiPageInput, AiDiscoveredGroup, AiAnalysisResult } from "../types.js";

export class MockProvider implements AiProvider {
  readonly name = "mock";
  private readonly groups: AiDiscoveredGroup[];
  private readonly pageName: string;

  constructor(groups?: AiDiscoveredGroup[], pageName?: string) {
    this.groups = groups ?? [];
    this.pageName = pageName ?? "Mock Page";
  }

  async analyzePageGroups(_input: AiPageInput): Promise<AiAnalysisResult> {
    return { pageName: this.pageName, groups: this.groups };
  }
}
