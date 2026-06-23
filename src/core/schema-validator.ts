import AjvModule from "ajv";
import addFormatsModule from "ajv-formats";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assetsRoot } from "../paths.js";
import type { ErrorObject } from "ajv";
import type { PlanDocument } from "../types.js";

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
  const goal = sections.get("goal");
  const stepsRaw = sections.get("steps");

  if (!goal || !stepsRaw) {
    throw new Error("Plan must include Goal and Steps sections");
  }

  const goalText = goal.trim();
  const non_goals = parseList(sections.get("non-goals") ?? "");
  const affected_modules = parseList(sections.get("affected modules") ?? "");
  const steps = parseSteps(stepsRaw);

  const doc: PlanDocument = {
    goal: goalText,
    non_goals,
    affected_modules,
    steps,
  };
  validatePlan(doc);
  return doc;
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
      const m = line.match(/^\*\*([^:]+):\*\*\s*(.*)$/);
      if (m) fields.set(m[1].trim().toLowerCase(), m[2].trim());
    }

    const action_types = (fields.get("action types") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean) as PlanDocument["steps"][0]["action_types"];

    const path_patterns = (fields.get("path patterns") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const command_patterns = (fields.get("command patterns") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      step_id,
      title,
      description: fields.get("description") || title,
      action_types,
      path_patterns: path_patterns.length ? path_patterns : undefined,
      command_patterns: command_patterns.length ? command_patterns : undefined,
      verification: fields.get("verification") ?? "",
      risks: fields.get("risks") ?? "",
      rollback: fields.get("rollback") ?? "",
      requires_user_confirm: /true/i.test(fields.get("requires user confirm") ?? ""),
    };
  });
}

export function planToAllowedSteps(plan: PlanDocument) {
  return plan.steps.map((step) => ({
    step_id: step.step_id,
    action_types: step.action_types,
    path_patterns: step.path_patterns,
    command_patterns: step.command_patterns,
  }));
}
