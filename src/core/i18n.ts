import { existsSync } from "node:fs";
import { join } from "node:path";
import { assetsRoot } from "../paths.js";

export type SupportedLanguage = "zh-CN" | "en";

export const DEFAULT_LANGUAGE: SupportedLanguage = "zh-CN";

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ["zh-CN", "en"];

export interface I18nMessages {
  requestTitle: string;
  reviewChecklistTitle: string;
  reviewChecklistItems: string[];
  reviewConclusion: string;
}

const MESSAGES: Record<SupportedLanguage, I18nMessages> = {
  "zh-CN": {
    requestTitle: "请求",
    reviewChecklistTitle: "审查清单",
    reviewChecklistItems: [
      "- 计划可执行",
      "- 没有明显遗漏或循环依赖",
      "- 没有没有验证措施的危险命令",
      "- 可以安全地逐步执行",
      "- 高危动作需要用户批准",
    ],
    reviewConclusion: "**结论**：`approved_recommendation` | `changes_requested`",
  },
  en: {
    requestTitle: "Request",
    reviewChecklistTitle: "Review checklist",
    reviewChecklistItems: [
      "- Plan is executable",
      "- No obvious omissions or circular dependencies",
      "- No dangerous commands without verification",
      "- Can be executed step-by-step safely",
      "- User approval required for high-risk actions",
    ],
    reviewConclusion: "**Conclusion**: `approved_recommendation` | `changes_requested`",
  },
};

/** Canonical plan section keys → localized header aliases (lowercase). */
export const PLAN_SECTION_ALIASES = {
  goal: ["goal", "目标"],
  steps: ["steps", "步骤"],
  nonGoals: ["non-goals", "非目标"],
  affectedModules: ["affected modules", "受影响模块"],
} as const;

/** Canonical plan field keys → localized label aliases (lowercase). */
export const PLAN_FIELD_ALIASES = {
  description: ["description", "描述"],
  actionTypes: ["action types", "动作类型"],
  pathPatterns: ["path patterns", "路径模式"],
  commandPatterns: ["command patterns", "命令模式"],
  verification: ["verification", "验证"],
  risks: ["risks", "风险"],
  rollback: ["rollback", "回滚"],
  requiresUserConfirm: ["requires user confirm", "需要用户确认"],
} as const;

/** Markers used to detect an existing review checklist (any language). */
export const REVIEW_CHECKLIST_MARKERS = [
  "## 审查清单",
  "## Review checklist",
];

export function normalizeLanguage(raw: unknown): SupportedLanguage {
  if (typeof raw !== "string" || !raw) return DEFAULT_LANGUAGE;
  const trimmed = raw.trim();
  if (trimmed === "zh-CN" || trimmed === "zh") return "zh-CN";
  if (trimmed === "en") return "en";
  return DEFAULT_LANGUAGE;
}

export function languageFallbackChain(requested: SupportedLanguage): SupportedLanguage[] {
  const chain: SupportedLanguage[] = [requested];
  for (const fallback of [DEFAULT_LANGUAGE, "en"] as SupportedLanguage[]) {
    if (!chain.includes(fallback)) chain.push(fallback);
  }
  return chain;
}

export function getMessages(lang: SupportedLanguage): I18nMessages {
  return MESSAGES[lang];
}

export function getMessagesForLanguage(raw: unknown): I18nMessages {
  return getMessages(normalizeLanguage(raw));
}

export function resolveTemplatePath(name: string, lang: SupportedLanguage): string | null {
  for (const candidate of languageFallbackChain(lang)) {
    const path = join(assetsRoot(), "templates", candidate, name);
    if (existsSync(path)) return path;
  }
  return null;
}
