import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

/** Wrap a JSON-serializable result into an MCP text content block. */
export function ok(obj: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

/** Wrap a plain string into an MCP text content block. */
export function okText(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

/** Read a text file (Node替代 Bun.file().text())。文件不存在返回 null。 */
export async function readTextFile(filePath: string): Promise<string | null> {
  if (!existsSync(filePath)) return null;
  return readFile(filePath, "utf-8");
}

/** Write a text file，自动创建父目录。 */
export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
}

/** Write a binary file（Node替代 Bun.write(Uint8Array)），自动创建父目录。 */
export async function writeBinaryFile(filePath: string, data: Uint8Array): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, data);
}
