import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { expect } from "vitest";

const SURVEY_ROOT = resolve("railwise/survey-mcp");

type RpcResponse = {
  id?: number;
  result?: {
    content?: Array<{ type: "text"; text: string }>;
  };
  error?: unknown;
};

async function once<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`survey MCP timeout while waiting for ${label}`)),
          5000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runSurveyTool(
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const build = spawnSync("npm", ["--prefix", "railwise/survey-mcp", "run", "build"], {
    cwd: resolve("."),
    encoding: "utf8",
  });
  expect(build.status, build.stderr || build.stdout).toBe(0);

  const child: ChildProcessWithoutNullStreams = spawn("node", ["dist/index.js"], {
    cwd: SURVEY_ROOT,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let nextId = 1;
  const pending = new Map<number, (response: RpcResponse) => void>();
  let buf = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buf += chunk;
    let idx = buf.indexOf("\n");
    while (idx >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line) {
        const response = JSON.parse(line) as RpcResponse;
        if (typeof response.id === "number") pending.get(response.id)?.(response);
      }
      idx = buf.indexOf("\n");
    }
  });

  const send = (method: string, params: Record<string, unknown> = {}): Promise<RpcResponse> => {
    const id = nextId++;
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return new Promise((resolveResponse) => pending.set(id, resolveResponse));
  };

  try {
    await once(
      send("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "railwise-e2e-test", version: "0.0.0" },
      }),
      "initialize",
    );
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`,
    );
    const response = await once(send("tools/call", { name, arguments: args }), name);
    expect(response.error).toBeUndefined();
    const text = response.result?.content?.[0]?.text;
    expect(text).toBeTruthy();
    return JSON.parse(text!) as Record<string, unknown>;
  } finally {
    child.kill("SIGTERM");
  }
}
