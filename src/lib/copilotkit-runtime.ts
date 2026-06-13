import { HttpAgent } from "@ag-ui/client";
import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
  InMemoryAgentRunner,
} from "@copilotkit/runtime/v2";

function agentUrl(path: string) {
  const base = process.env.AGENT_BASE_URL?.trim() || "http://localhost:8123";
  return `${base.replace(/\/$/, "")}${path}`;
}

export function buildCopilotRuntimeConfig(
  basePath: string,
  agentPath: string,
  agentKey: string,
) {
  const url = agentUrl(agentPath);
  return {
    basePath,
    agentPath,
    agentKey,
    url,
    runtime: {
      agents: {
        default: url,
        [agentKey]: url,
      },
      a2ui: { injectA2UITool: false },
    },
    mode: "multi-route" as const,
  };
}

export function createCopilotV2Handler(
  basePath: string,
  agentPath: string,
  agentKey: string,
) {
  const config = buildCopilotRuntimeConfig(basePath, agentPath, agentKey);
  const httpAgent = new HttpAgent({ url: config.url });
  const runtime = new CopilotRuntime({
    agents: {
      default: httpAgent,
      [agentKey]: httpAgent,
    },
    runner: new InMemoryAgentRunner(),
    a2ui: config.runtime.a2ui,
  });

  return createCopilotRuntimeHandler({
    runtime,
    basePath: config.basePath,
    mode: config.mode,
  });
}
