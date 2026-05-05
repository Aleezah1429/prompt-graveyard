export interface RawUsage {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens?: number;
}

export interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
  turnIndex: number;
  timestamp: string;
}

export interface ToolResult {
  toolUseId: string;
  text: string;
  bytes: number;
  turnIndex: number;
}

export interface Turn {
  index: number;
  uuid: string;
  role: "user" | "assistant";
  timestamp: string;
  text: string;
  thinking: string;
  usage?: RawUsage;
  model?: string;
  toolUses: ToolUse[];
  toolResults: ToolResult[];
}

export interface Session {
  sessionId: string;
  cwd: string;
  gitBranch?: string;
  startedAt: string;
  endedAt: string;
  turns: Turn[];
  models: string[];
  totals: {
    inputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    outputTokens: number;
    grandTotal: number;
    costUsd: number;
  };
}

export interface Finding {
  detector: string;
  severity: "info" | "warn" | "high";
  title: string;
  detail: string;
  wastedTokens?: number;
  turnIndices: number[];
}

export interface Report {
  session: Session;
  findings: Finding[];
  wasteScore: number;
  wastedCostUsd: number;
}
