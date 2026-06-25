import AjvModule from "ajv";
import addFormatsModule from "ajv-formats";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assetsRoot } from "../paths.js";
import type { ErrorObject } from "ajv";
import type { AllowedStep, LoopPolicy, PlanDocument } from "../types.js";
import { PLAN_FIELD_ALIASES, PLAN_SECTION_ALIASES } from "./i18n.js";

const Ajv = AjvModule.default ?? AjvModule;
const addFormats = addFormatsModule.default ?? addFormatsModule;

const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
addFormats(ajv);

function loadSchema(name: string): object {
  return JSON.parse(readFileSync(join(assetsRoot(), "schemas", name), "utf8"));
}

const validators = {
  approval: ajv.compile(loadSchema("approval.schema.json")),
  plan: ajv.compile(loadSchema("plan.schema.json")),
  event: ajv.compile(loadSchema("event.schema.json")),
};

export function validateApproval(data: unknown): void {
  if (!validators.approval(data)) {
    throw new Error(formatErrors(validators.approval.errors));
  }
}

export function validatePlan(data: unknown): void {
  if (!validators.plan(data)) {
    throw new Error(formatErrors(validators.plan.errors));
  }
}

export function validateEvent(data: unknown): void {
  if (!validators.event(data)) {
    throw new Error(formatErrors(validators.event.errors));
  }
}

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors) return "Unknown schema validation error";
  return errors.map((e: ErrorObject) => `${e.instancePath || "/"} ${e.message}`).join("; ");
}

export function parsePlanMarkdown(content: string): PlanDocument {
  const sections = splitTopLevelSections(content);
  const goal = getSection(sections, PLAN_SECTION_ALIASES.goal);
  const stepsRaw = getSection(sections, PLAN_SECTION_ALIASES.steps);

  if (!goal || !stepsRaw) {
    throw new Error("Plan must include Goal/目标 and Steps/步骤 sections");
  }

  const goalText = goal.trim();
  const non_goals = parseList(getSection(sections, PLAN_SECTION_ALIASES.nonGoals) ?? "");
  const affected_modules = parseList(
    getSection(sections, PLAN_SECTION_ALIASES.affectedModules) ?? "",
  );
  const steps = parseSteps(stepsRaw);
  const loop = parseLoopSection(sections);

  const doc: PlanDocument = {
    goal: goalText,
    non_goals,
    affected_modules,
    steps,
    ...(loop ? { loop } : {}),
  };
  validatePlan(doc);
  return doc;
}

function parseLoopSection(sections: Map<string, string>): LoopPolicy | undefined {
  const stopRaw = getSection(sections, PLAN_SECTION_ALIASES.stopCondition);
  if (!stopRaw) return undefined;

  // Strip HTML comments so commented-out template placeholders are never parsed.
  const stopClean = stopRaw.replace(/<!--[\s\S]*?-->/g, "");

  const fields = new Map<string, string>();
  for (const line of stopClean.split("\n")) {
    const m = line.match(/^\*\*([^:：]+)[：:]\*\*\s*(.*)$/);
    if (m) fields.set(m[1].trim().toLowerCase(), m[2].trim());
  }

  // Only an explicit "**Command:** ..." field enables a loop. There is intentionally
  // no "first non-empty line" fallback, so commented-out / placeholder template
  // sections never accidentally turn a plain run into a self-driving loop.
  const stop_command = getField(fields, PLAN_FIELD_ALIASES.stopCommand);

  const maxIterRaw = getField(fields, PLAN_FIELD_ALIASES.maxIterations) ??
    getSection(sections, PLAN_SECTION_ALIASES.maxIterations)?.trim();

  if (!stop_command) return undefined;

  const max_iterations = maxIterRaw ? parseInt(maxIterRaw, 10) : 10;
  if (!Number.isFinite(max_iterations) || max_iterations < 1) {
    throw new Error(`Invalid max_iterations: ${maxIterRaw}`);
  }

  return { stop_command, max_iterations };
}

function getSection(sections: Map<string, string>, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = sections.get(name);
    if (value !== undefined) return value;
  }
  return undefined;
}

function splitTopLevelSections(content: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = content.split("\n");
  let currentKey: string | null = null;
  let buffer: string[] = [];

  for (const line of lines) {
    const header = line.match(/^# ([^#\n].*)$/);
    if (header) {
      if (currentKey) {
        map.set(currentKey, buffer.join("\n"));
      }
      currentKey = header[1].trim().toLowerCase();
      buffer = [];
      continue;
    }
    if (currentKey) {
      buffer.push(line);
    }
  }

  if (currentKey) {
    map.set(currentKey, buffer.join("\n"));
  }

  return map;
}

function parseList(section: string): string[] {
  return section
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function parseSteps(section: string): PlanDocument["steps"] {
  const blocks = section.split(/^##\s+/m).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split("\n");
    const titleLine = lines[0]?.trim() ?? "";
    const stepIdMatch = titleLine.match(/\[([^\]]+)\]/);
    const step_id = stepIdMatch?.[1] ?? titleLine;
    const title = titleLine.replace(/\[([^\]]+)\]\s*/, "").trim() || step_id;

    const fields = new Map<string, string>();
    for (const line of lines.slice(1)) {
      const m = line.match(/^\*\*([^:：]+)[：:]\*\*\s*(.*)$/);
      if (m) fields.set(m[1].trim().toLowerCase(), m[2].trim());
    }

    const action_types = (getField(fields, PLAN_FIELD_ALIASES.actionTypes) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean) as PlanDocument["steps"][0]["action_types"];

    const path_patterns = (getField(fields, PLAN_FIELD_ALIASES.pathPatterns) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const command_patterns = (getField(fields, PLAN_FIELD_ALIASES.commandPatterns) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      step_id,
      title,
      description: getField(fields, PLAN_FIELD_ALIASES.description) || title,
      action_types,
      path_patterns: path_patterns.length ? path_patterns : undefined,
      command_patterns: command_patterns.length ? command_patterns : undefined,
      verification: getField(fields, PLAN_FIELD_ALIASES.verification) ?? "",
      risks: getField(fields, PLAN_FIELD_ALIASES.risks) ?? "",
      rollback: getField(fields, PLAN_FIELD_ALIASES.rollback) ?? "",
      requires_user_confirm: /true/i.test(
        getField(fields, PLAN_FIELD_ALIASES.requiresUserConfirm) ?? "",
      ),
    };
  });
}

function getField(fields: Map<string, string>, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = fields.get(name);
    if (value !== undefined) return value;
  }
  return undefined;
}

export function planToAllowedSteps(plan: PlanDocument): AllowedStep[] {
  return plan.steps.map((step) => ({
    step_id: step.step_id,
    action_types: step.action_types,
    path_patterns: step.path_patterns,
    command_patterns: step.command_patterns,
  }));
}

export function planToLoopPolicy(plan: PlanDocument): LoopPolicy | undefined {
  return plan.loop;
}
