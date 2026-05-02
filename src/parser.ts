import { readFileSync } from "node:fs";
import type { Session, Turn, ToolUse, ToolResult, RawUsage } from "./types.js";

interface RawRecord {
  type: string;
  uuid?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  gitBranch?: string;
  message?: {
    role?: string;
    content?: unknown;
    usage?: RawUsage;
  };
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is { type: string; text?: string } => typeof b === "object" && b !== null)
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");
}

function extractThinking(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is { type: string; thinking?: string } => typeof b === "object" && b !== null)
    .filter((b) => b.type === "thinking")
    .map((b) => b.thinking ?? "")
    .join("\n");
}

function extractToolUses(content: unknown, turnIndex: number, timestamp: string): ToolUse[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter((b): b is { type: string; id?: string; name?: string; input?: Record<string, unknown> } =>
      typeof b === "object" && b !== null
    )
    .filter((b) => b.type === "tool_use")
    .map((b) => ({
      id: b.id ?? "",
      name: b.name ?? "",
      input: b.input ?? {},
      turnIndex,
      timestamp,
    }));
}

function extractToolResults(content: unknown, turnIndex: number): ToolResult[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter((b): b is { type: string; tool_use_id?: string; content?: unknown } =>
      typeof b === "object" && b !== null
    )
    .filter((b) => b.type === "tool_result")
    .map((b) => {
      let text = "";
      if (typeof b.content === "string") {
        text = b.content;
      } else if (Array.isArray(b.content)) {
        text = b.content
          .filter((c): c is { type: string; text?: string } => typeof c === "object" && c !== null)
          .map((c) => (c.type === "text" ? c.text ?? "" : ""))
          .join("\n");
      }
      return {
        toolUseId: b.tool_use_id ?? "",
        text,
        bytes: Buffer.byteLength(text, "utf8"),
        turnIndex,
      };
    });
}

export function parseSession(filePath: string): Session {
  const lines = readFileSync(filePath, "utf8").split("\n").filter((l) => l.trim().length > 0);

  let sessionId = "";
  let cwd = "";
  let gitBranch: string | undefined;
  let startedAt = "";
  let endedAt = "";
  const turns: Turn[] = [];

  for (const line of lines) {
    let rec: RawRecord;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    if (rec.sessionId && !sessionId) sessionId = rec.sessionId;
    if (rec.cwd && !cwd) cwd = rec.cwd;
    if (rec.gitBranch) gitBranch = rec.gitBranch;
    if (rec.timestamp) {
      if (!startedAt) startedAt = rec.timestamp;
      endedAt = rec.timestamp;
    }

    if (rec.type !== "user" && rec.type !== "assistant") continue;
    if (!rec.message) continue;

    const turnIndex = turns.length;
    const content = rec.message.content;
    const turn: Turn = {
      index: turnIndex,
      uuid: rec.uuid ?? "",
      role: rec.type as "user" | "assistant",
      timestamp: rec.timestamp ?? "",
      text: extractText(content),
      thinking: extractThinking(content),
      usage: rec.message.usage,
      toolUses: extractToolUses(content, turnIndex, rec.timestamp ?? ""),
      toolResults: extractToolResults(content, turnIndex),
    };
    turns.push(turn);
  }

  const totals = turns.reduce(
    (acc, t) => {
      const u = t.usage;
      if (u) {
        acc.inputTokens += u.input_tokens ?? 0;
        acc.cacheCreationTokens += u.cache_creation_input_tokens ?? 0;
        acc.cacheReadTokens += u.cache_read_input_tokens ?? 0;
        acc.outputTokens += u.output_tokens ?? 0;
      }
      return acc;
    },
    { inputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0, grandTotal: 0 }
  );
  totals.grandTotal =
    totals.inputTokens + totals.cacheCreationTokens + totals.cacheReadTokens + totals.outputTokens;

  return { sessionId, cwd, gitBranch, startedAt, endedAt, turns, totals };
}
