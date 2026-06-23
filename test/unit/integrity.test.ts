import { describe, expect, it } from "vitest";
import { sha256, signPlanHash, verifyPlanIntegrity, verifyPlanSignature } from "../../src/core/integrity.js";

describe("integrity", () => {
  it("signs and verifies plan hash", () => {
    const content = "# Goal\n\ntest\n";
    const hash = sha256(content);
    const sig = signPlanHash(hash);
    expect(verifyPlanSignature(hash, sig)).toBe(true);
    expect(verifyPlanSignature(hash, "bad")).toBe(false);
  });

  it("detects plan tampering", () => {
    const original = "# Goal\n\noriginal\n";
    const hash = sha256(original);
    const sig = signPlanHash(hash);
    const check = verifyPlanIntegrity("# Goal\n\ntampered\n", hash, sig);
    expect(check.ok).toBe(false);
  });
});
