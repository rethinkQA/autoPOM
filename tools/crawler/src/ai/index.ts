/**
 * AI discovery — public API.
 */

export { discoverGroupsWithAi } from "./discover-ai.js";
export { createAiProvider } from "./provider.js";
export { capturePageContext } from "./capture.js";
export type {
  AiProvider,
  AiProviderConfig,
  AiProviderName,
  AiPageInput,
  AiDiscoveredGroup,
  AiAnalysisResult,
} from "./types.js";
