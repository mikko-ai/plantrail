import { createHash, createHmac, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { plantrailHome, plantrailKeyPath } from "../paths.js";

export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function ensurePlantrailKey(): Buffer {
  const keyPath = plantrailKeyPath();
  mkdirSync(plantrailHome(), { recursive: true, mode: 0o700 });
  if (!existsSync(keyPath)) {
    const key = randomBytes(32);
    writeFileSync(keyPath, key);
    chmodSync(keyPath, 0o600);
    return key;
  }
  chmodSync(keyPath, 0o600);
  return readFileSync(keyPath);
}

export function signPlanHash(planHash: string): string {
  const key = ensurePlantrailKey();
  return createHmac("sha256", key).update(planHash, "utf8").digest("hex");
}

export function verifyPlanSignature(planHash: string, signature: string): boolean {
  const expected = signPlanHash(planHash);
  return timingSafeEqualHex(expected, signature);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export interface IntegrityCheck {
  ok: boolean;
  reason: string;
  planHash?: string;
}

export function verifyPlanIntegrity(
  planContent: string,
  planHash?: string,
  signature?: string,
): IntegrityCheck {
  if (!planHash || !signature) {
    return { ok: false, reason: "Approval missing plan_hash or signature" };
  }
  const currentHash = sha256(planContent);
  if (currentHash !== planHash) {
    return {
      ok: false,
      reason: "Plan content changed after approval; approval invalidated",
      planHash: currentHash,
    };
  }
  if (!verifyPlanSignature(planHash, signature)) {
    return { ok: false, reason: "Invalid approval signature" };
  }
  return { ok: true, reason: "Integrity verified", planHash: currentHash };
}
