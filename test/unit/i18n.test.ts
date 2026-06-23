import { describe, expect, it } from "vitest";
import {
  DEFAULT_LANGUAGE,
  getMessages,
  getMessagesForLanguage,
  languageFallbackChain,
  normalizeLanguage,
  resolveTemplatePath,
} from "../../src/core/i18n.js";

describe("i18n", () => {
  it("normalizes supported languages", () => {
    expect(normalizeLanguage(undefined)).toBe("zh-CN");
    expect(normalizeLanguage("zh-CN")).toBe("zh-CN");
    expect(normalizeLanguage("zh")).toBe("zh-CN");
    expect(normalizeLanguage("en")).toBe("en");
    expect(normalizeLanguage("fr")).toBe(DEFAULT_LANGUAGE);
    expect(normalizeLanguage(42)).toBe(DEFAULT_LANGUAGE);
    expect(normalizeLanguage({})).toBe(DEFAULT_LANGUAGE);
  });

  it("builds language fallback chains", () => {
    expect(languageFallbackChain("zh-CN")).toEqual(["zh-CN", "en"]);
    expect(languageFallbackChain("en")).toEqual(["en", "zh-CN"]);
  });

  it("returns localized messages", () => {
    expect(getMessages("zh-CN").requestTitle).toBe("请求");
    expect(getMessages("en").requestTitle).toBe("Request");
    expect(getMessagesForLanguage("en").reviewChecklistTitle).toBe("Review checklist");
  });

  it("resolves template paths with fallback", () => {
    expect(resolveTemplatePath("plan.md", "zh-CN")).toContain("templates/zh-CN/plan.md");
    expect(resolveTemplatePath("plan.md", "en")).toContain("templates/en/plan.md");
  });

  it("returns null when template does not exist in any language", () => {
    expect(resolveTemplatePath("nonexistent.md", "en")).toBeNull();
  });
});
