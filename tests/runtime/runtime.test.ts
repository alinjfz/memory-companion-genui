import assert from "node:assert/strict";
import test from "node:test";

import { buildCopilotRuntimeConfig } from "@/lib/copilotkit-runtime";
import { linkupDeepSearch, linkupMusicSearch } from "@/lib/linkup";
import {
  redisDel,
  redisGet,
  redisGetActivity,
  redisPushActivity,
  redisSet,
} from "@/lib/redis";

function withEnv(name: string, value: string | undefined) {
  const previous = process.env[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
  return () => {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  };
}

function mockFetchOnce(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> | Response) {
  const previous = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  return () => {
    globalThis.fetch = previous;
  };
}

test("CopilotKit runtime config keeps AG-UI wiring intact", () => {
  const config = buildCopilotRuntimeConfig("/api/copilotkit-patient", "/patient", "patient_agent");

  assert.equal(config.basePath, "/api/copilotkit-patient");
  assert.equal(config.agentPath, "/patient");
  assert.equal(config.agentKey, "patient_agent");
  assert.equal(config.url, "http://localhost:8123/patient");
  assert.equal(config.runtime.agents.default, "http://localhost:8123/patient");
  assert.equal(config.runtime.agents.patient_agent, "http://localhost:8123/patient");
  assert.equal(config.runtime.a2ui.injectA2UITool, false);
  assert.equal(config.mode, "single-route");
});

test("Linkup deep search posts the expected request and returns sources", async () => {
  const restoreEnv = withEnv("LINKUP_API_KEY", "test-linkup-key");
  const restoreOffline = withEnv("OFFLINE", undefined);
  const restoreFetch = mockFetchOnce(async (input, init) => {
    assert.equal(String(input), "https://api.linkup.so/v1/search");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-linkup-key");
    const body = JSON.parse(String(init?.body)) as { q?: string; depth?: string; outputType?: string };
    assert.equal(body.q, "Evening agitation");
    assert.equal(body.depth, "deep");
    assert.equal(body.outputType, "sourcedAnswer");

    return new Response(
      JSON.stringify({
        answer: "Try a quiet walk after tea. It often helps.",
        results: [
          {
            name: "NHS",
            url: "https://www.nhs.uk/",
            snippet: "Useful guidance.",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });

  try {
    const result = await linkupDeepSearch("Evening agitation");
    assert.deepEqual(result, {
      answer: "Try a quiet walk after tea. It often helps.",
      sources: [
        {
          name: "NHS",
          url: "https://www.nhs.uk/",
          snippet: "Useful guidance.",
        },
      ],
    });
  } finally {
    restoreFetch();
    restoreOffline();
    restoreEnv();
  }
});

test("Linkup music search falls back when the search has no answer", async () => {
  const restoreEnv = withEnv("LINKUP_API_KEY", "test-linkup-key");
  const restoreOffline = withEnv("OFFLINE", undefined);
  const restoreFetch = mockFetchOnce(async () => {
    return new Response(JSON.stringify({ answer: "", results: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  try {
    const result = await linkupMusicSearch("Frank Sinatra");
    assert.deepEqual(result, {
      artist: "Frank Sinatra",
      songTitle: "You Are My Sunshine",
      description: "A warm favourite from your life.",
    });
  } finally {
    restoreFetch();
    restoreOffline();
    restoreEnv();
  }
});

test("Redis helpers use the in-memory fallback when Redis is not configured", async () => {
  const restoreEnv = withEnv("REDIS_URL", undefined);
  const key = `runtime:test:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const activityCode = `ECHO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  try {
    await redisSet(key, "hello");
    assert.equal(await redisGet(key), "hello");

    await redisPushActivity(activityCode, JSON.stringify({ type: "panic", description: "Pressed panic" }));
    await redisPushActivity(activityCode, JSON.stringify({ type: "panic_resolved", description: "Music started" }));

    assert.deepEqual(await redisGetActivity(activityCode), [
      JSON.stringify({ type: "panic_resolved", description: "Music started" }),
      JSON.stringify({ type: "panic", description: "Pressed panic" }),
    ]);

    await redisDel(key);
    assert.equal(await redisGet(key), null);
  } finally {
    restoreEnv();
  }
});

test("Research API prefers Linkup and returns a sourced evidence surface", async () => {
  const restoreEnv = withEnv("LINKUP_API_KEY", "test-linkup-key");
  const restoreOffline = withEnv("OFFLINE", undefined);
  const restoreFetch = mockFetchOnce(async () => {
    return new Response(
      JSON.stringify({
        answer: "Keep evenings calm with a predictable routine.",
        results: [
          {
            name: "NHS",
            url: "https://www.nhs.uk/",
            snippet: "Trusted source.",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });

  try {
    const { POST } = await import("@/app/api/research/route");
    const response = await POST(
      new Request("http://localhost/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "What helps with evening agitation?" }),
      }),
    );
    assert.equal(response.ok, true);

    const data = (await response.json()) as {
      query?: string;
      evidence?: { suggestion?: string; source?: string; url?: string; summary?: string };
      surface?: { catalogId?: string; components?: unknown[] };
    };

    assert.equal(data.query, "What helps with evening agitation?");
    assert.equal(data.evidence?.source, "NHS · Linkup");
    assert.equal(data.evidence?.suggestion, "Keep evenings calm with a predictable routine");
    assert.equal(data.surface?.catalogId, "echoes-patient-v1");
    assert.ok(Array.isArray(data.surface?.components));
  } finally {
    restoreFetch();
    restoreOffline();
    restoreEnv();
  }
});
