/**
 * Mock provider for testing — returns predefined groups.
 * Useful for CI, snapshot tests, and development without an API key.
 */

import type { AiProvider, AiPageInput, AiDiscoveredGroup } from "../types.js";

export class MockProvider implements AiProvider {
  readonly name = "mock";
  private readonly groups: AiDiscoveredGroup[];

  constructor(groups?: AiDiscoveredGroup[]) {
    this.groups = groups ?? [];
  }

  async analyzePageGroups(_input: AiPageInput): Promise<AiDiscoveredGroup[]> {
    return this.groups;
  }
}
