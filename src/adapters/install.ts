import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { backupFile, injectMarkerBlock, readJson, readText, removeMarkerBlock, writeJson, writeText } from "../core/fs-safe.js";
import { assetsRoot, packageRoot } from "../paths.js";

export type AgentName = "cursor" | "codex" | "claude";
export type InstallScope = "project" | "global";

const PLANTRAIL_HOOK_ID = "plantrail-gate";

export interface InstallTarget {
  agent: AgentName;
  scope: InstallScope;
  projectRoot: string;
}

export function installAgent(target: InstallTarget): void {
  switch (target.agent) {
    case "cursor":
      installCursor(target);
      break;
    case "codex":
      installCodex(target);
      break;
    case "claude":
      installClaude(target);
      break;
  }
  installSharedAssets(target);
}

export function uninstallAgent(target: InstallTarget): void {
  switch (target.agent) {
    case "cursor":
      uninstallCursor(target);
      break;
    case "codex":
      uninstallCodex(target);
      break;
    case "claude":
      uninstallClaude(target);
      break;
  }
}

function hookCommand(agent: AgentName, scope: InstallScope, projectRoot: string): string {
  const root = scope === "project" ? projectRoot : join(process.env.HOME ?? "", "");
  const rel =
    agent === "cursor"
      ? scope === "project"
        ? ".cursor/hooks/plantrail-gate.js"
        : ".cursor/hooks/plantrail-gate.js"
      : agent === "codex"
        ? scope === "project"
          ? ".codex/hooks/plantrail-gate.js"
          : ".codex/hooks/plantrail-gate.js"
        : scope === "project"
          ? ".claude/hooks/plantrail-gate.js"
          : ".claude/hooks/plantrail-gate.js";
  return `node ${join(root, rel)}`;
}

function copyHookBundle(agent: AgentName, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  const src = join(assetsRoot(), "hooks", agent === "claude" ? "claude" : agent, "gate.js");
  const dest = join(destDir, "plantrail-gate.js");
  if (existsSync(src)) {
    writeText(dest, readText(src));
  } else {
    // fallback to TS source path message during dev
    writeText(dest, `#!/usr/bin/env node\nconsole.error('Run npm run build to bundle hooks'); process.exit(1);\n`);
  }
}

function installCursor(target: InstallTarget): void {
  const base = target.scope === "project" ? join(target.projectRoot, ".cursor") : join(process.env.HOME ?? "", ".cursor");
  mkdirSync(base, { recursive: true });
  copyHookBundle("cursor", join(base, "hooks"));

  const hooksPath = join(base, "hooks.json");
  backupFile(hooksPath);
  const existing = existsSync(hooksPath) ? readJson<Record<string, unknown>>(hooksPath) : { version: 1, hooks: {} };
  const hooks = (existing.hooks as Record<string, unknown[]>) ?? {};
  const cmd = hookCommand("cursor", target.scope, target.projectRoot);
  const entry = { command: cmd, plantrail: PLANTRAIL_HOOK_ID };
  for (const event of ["preToolUse", "beforeShellExecution", "stop"]) {
    const list = (hooks[event] as Record<string, unknown>[]) ?? [];
    const filtered = list.filter((h) => h.plantrail !== PLANTRAIL_HOOK_ID);
    filtered.push(entry);
    hooks[event] = filtered;
  }
  writeJson(hooksPath, { ...existing, version: 1, hooks });

  const rulesPath = join(base, "rules", "plantrail.mdc");
  mkdirSync(dirname(rulesPath), { recursive: true });
  writeText(rulesPath, readText(join(assetsRoot(), "fragments", "cursor.mdc")));
}

function uninstallCursor(target: InstallTarget): void {
  const base = target.scope === "project" ? join(target.projectRoot, ".cursor") : join(process.env.HOME ?? "", ".cursor");
  const hooksPath = join(base, "hooks.json");
  if (existsSync(hooksPath)) {
    const existing = readJson<Record<string, unknown>>(hooksPath);
    const hooks = (existing.hooks as Record<string, unknown[]>) ?? {};
    for (const key of Object.keys(hooks)) {
      hooks[key] = ((hooks[key] as Record<string, unknown>[]) ?? []).filter(
        (h) => h.plantrail !== PLANTRAIL_HOOK_ID,
      );
    }
    writeJson(hooksPath, { ...existing, hooks });
  }
}

function installCodex(target: InstallTarget): void {
  const base = target.scope === "project" ? join(target.projectRoot, ".codex") : join(process.env.HOME ?? "", ".codex");
  mkdirSync(base, { recursive: true });
  copyHookBundle("codex", join(base, "hooks"));

  const hooksPath = join(base, "hooks.json");
  backupFile(hooksPath);
  const existing = existsSync(hooksPath) ? readJson<Record<string, unknown>>(hooksPath) : { hooks: {} };
  const hooks = (existing.hooks as Record<string, unknown[]>) ?? {};
  const cmd = hookCommand("codex", target.scope, target.projectRoot);
  const entry = { command: cmd, plantrail: PLANTRAIL_HOOK_ID };
  for (const event of ["PreToolUse", "PostToolUse", "Stop"]) {
    const list = (hooks[event] as Record<string, unknown>[]) ?? [];
    const filtered = list.filter((h) => h.plantrail !== PLANTRAIL_HOOK_ID);
    filtered.push(entry);
    hooks[event] = filtered;
  }
  writeJson(hooksPath, { ...existing, hooks });

  const agentsPath =
    target.scope === "project"
      ? join(target.projectRoot, "AGENTS.md")
      : join(process.env.HOME ?? "", ".codex", "AGENTS.md");
  const fragment = readText(join(assetsRoot(), "fragments", "codex.AGENTS.md"));
  const current = existsSync(agentsPath) ? readText(agentsPath) : "";
  writeText(agentsPath, injectMarkerBlock(current, fragment));
}

function uninstallCodex(target: InstallTarget): void {
  const base = target.scope === "project" ? join(target.projectRoot, ".codex") : join(process.env.HOME ?? "", ".codex");
  const hooksPath = join(base, "hooks.json");
  if (existsSync(hooksPath)) {
    const existing = readJson<Record<string, unknown>>(hooksPath);
    const hooks = (existing.hooks as Record<string, unknown[]>) ?? {};
    for (const key of Object.keys(hooks)) {
      hooks[key] = ((hooks[key] as Record<string, unknown>[]) ?? []).filter(
        (h) => h.plantrail !== PLANTRAIL_HOOK_ID,
      );
    }
    writeJson(hooksPath, { ...existing, hooks });
  }
}

function installClaude(target: InstallTarget): void {
  const base = target.scope === "project" ? join(target.projectRoot, ".claude") : join(process.env.HOME ?? "", ".claude");
  mkdirSync(base, { recursive: true });
  copyHookBundle("claude", join(base, "hooks"));

  const settingsPath = join(base, "settings.json");
  backupFile(settingsPath);
  const existing = existsSync(settingsPath) ? readJson<Record<string, unknown>>(settingsPath) : {};
  const hooks = (existing.hooks as Record<string, unknown[]>) ?? {};
  const cmd = hookCommand("claude", target.scope, target.projectRoot);
  const hookEntry = {
    matcher: ".*",
    hooks: [{ type: "command", command: cmd, plantrail: PLANTRAIL_HOOK_ID }],
  };

  for (const event of ["PreToolUse", "PostToolUse", "Stop"]) {
    const list = (hooks[event] as Record<string, unknown>[]) ?? [];
    const filtered = list.filter(
      (group) =>
        !((group.hooks as Record<string, unknown>[]) ?? []).some((h) => h.plantrail === PLANTRAIL_HOOK_ID),
    );
    filtered.push(hookEntry);
    hooks[event] = filtered;
  }
  writeJson(settingsPath, { ...existing, hooks });

  const claudeMd =
    target.scope === "project"
      ? join(target.projectRoot, "CLAUDE.md")
      : join(process.env.HOME ?? "", ".claude", "CLAUDE.md");
  const fragment = readText(join(assetsRoot(), "fragments", "claude.CLAUDE.md"));
  const current = existsSync(claudeMd) ? readText(claudeMd) : "";
  writeText(claudeMd, injectMarkerBlock(current, fragment));
}

function uninstallClaude(target: InstallTarget): void {
  const base = target.scope === "project" ? join(target.projectRoot, ".claude") : join(process.env.HOME ?? "", ".claude");
  const settingsPath = join(base, "settings.json");
  if (existsSync(settingsPath)) {
    const existing = readJson<Record<string, unknown>>(settingsPath);
    const hooks = (existing.hooks as Record<string, unknown[]>) ?? {};
    for (const key of Object.keys(hooks)) {
      hooks[key] = ((hooks[key] as Record<string, unknown>[]) ?? []).filter(
        (group) =>
          !((group.hooks as Record<string, unknown>[]) ?? []).some((h) => h.plantrail === PLANTRAIL_HOOK_ID),
      );
    }
    writeJson(settingsPath, { ...existing, hooks });
  }
}

function installSharedAssets(target: InstallTarget): void {
  const skillSrc = join(assetsRoot(), "skills", "agent-loop", "SKILL.md");
  if (target.agent === "cursor") {
    const dest = join(
      target.scope === "project" ? target.projectRoot : join(process.env.HOME ?? "", ".cursor"),
      "skills",
      "agent-loop",
      "SKILL.md",
    );
    mkdirSync(dirname(dest), { recursive: true });
    if (existsSync(skillSrc)) writeText(dest, readText(skillSrc));
  }
  if (target.agent === "codex") {
    const dest = join(
      target.scope === "project" ? target.projectRoot : join(process.env.HOME ?? "", ".codex"),
      "skills",
      "agent-loop",
      "SKILL.md",
    );
    mkdirSync(dirname(dest), { recursive: true });
    if (existsSync(skillSrc)) writeText(dest, readText(skillSrc));
  }
  if (target.agent === "claude") {
    const dest = join(
      target.scope === "project" ? target.projectRoot : join(process.env.HOME ?? "", ".claude"),
      "skills",
      "agent-loop",
      "SKILL.md",
    );
    mkdirSync(dirname(dest), { recursive: true });
    if (existsSync(skillSrc)) writeText(dest, readText(skillSrc));
  }
}

export function parseAgents(raw: string): AgentName[] {
  return raw.split(",").map((a) => a.trim()) as AgentName[];
}
