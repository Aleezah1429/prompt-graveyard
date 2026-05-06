import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const SETTINGS_PATH = join(homedir(), ".claude", "settings.json");

export interface HookConfig {
  /** Where prompt-graveyard should write its report when a session ends. */
  outputPath: string;
  /** Format: "md" or "html" */
  format: "md" | "html" | "terminal";
  /** Path to the prompt-graveyard binary. */
  binPath: string;
}

function buildHookCommand(cfg: HookConfig): string {
  const flag = cfg.format === "md" ? `--md ${cfg.outputPath}` : cfg.format === "html" ? `--html ${cfg.outputPath}` : "";
  return flag
    ? `${cfg.binPath} --cwd "$CLAUDE_PROJECT_DIR" ${flag}`
    : `${cfg.binPath} --cwd "$CLAUDE_PROJECT_DIR"`;
}

export function buildHookSnippet(cfg: HookConfig): unknown {
  return {
    hooks: {
      Stop: [
        {
          matcher: "*",
          hooks: [
            {
              type: "command",
              command: buildHookCommand(cfg),
            },
          ],
        },
      ],
    },
  };
}

interface ClaudeSettings {
  hooks?: Record<string, Array<{ matcher?: string; hooks?: Array<{ type: string; command: string }> }>>;
  [key: string]: unknown;
}

export function installHook(cfg: HookConfig): { wrote: string; before: ClaudeSettings; after: ClaudeSettings } {
  const dir = dirname(SETTINGS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let existing: ClaudeSettings = {};
  if (existsSync(SETTINGS_PATH)) {
    try {
      existing = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
    } catch {
      throw new Error(`Could not parse ${SETTINGS_PATH}. Fix or remove it before --install.`);
    }
  }

  const command = buildHookCommand(cfg);
  const updated: ClaudeSettings = { ...existing };
  updated.hooks = updated.hooks ?? {};

  const stops = updated.hooks.Stop ?? [];
  const alreadyInstalled = stops.some((entry) =>
    (entry.hooks ?? []).some((h) => h.command.includes("prompt-graveyard"))
  );

  if (alreadyInstalled) {
    return { wrote: SETTINGS_PATH, before: existing, after: updated };
  }

  stops.push({
    matcher: "*",
    hooks: [{ type: "command", command }],
  });
  updated.hooks.Stop = stops;

  writeFileSync(SETTINGS_PATH, JSON.stringify(updated, null, 2) + "\n", "utf8");
  return { wrote: SETTINGS_PATH, before: existing, after: updated };
}

export function uninstallHook(): { wrote: string; removed: number } {
  if (!existsSync(SETTINGS_PATH)) return { wrote: SETTINGS_PATH, removed: 0 };
  let settings: ClaudeSettings = {};
  try {
    settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
  } catch {
    return { wrote: SETTINGS_PATH, removed: 0 };
  }
  if (!settings.hooks?.Stop) return { wrote: SETTINGS_PATH, removed: 0 };

  let removed = 0;
  const filteredStops = settings.hooks.Stop
    .map((entry) => {
      const hooks = (entry.hooks ?? []).filter((h) => {
        if (h.command.includes("prompt-graveyard")) {
          removed += 1;
          return false;
        }
        return true;
      });
      return { ...entry, hooks };
    })
    .filter((entry) => (entry.hooks ?? []).length > 0);

  if (filteredStops.length === 0) {
    delete settings.hooks.Stop;
  } else {
    settings.hooks.Stop = filteredStops;
  }

  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n", "utf8");
  return { wrote: SETTINGS_PATH, removed };
}
