import { describe, expect, it } from "vitest";
import { injectMarkerBlock, removeMarkerBlock } from "../../src/core/fs-safe.js";

describe("fs-safe", () => {
  it("injects and removes marker block idempotently", () => {
    const base = "# Title\n\nbody\n";
    const once = injectMarkerBlock(base, "plantrail rules");
    const twice = injectMarkerBlock(once, "plantrail rules updated");
    expect(twice).toContain("plantrail rules updated");
    expect(twice.match(/# >>> plantrail >>>/g)?.length).toBe(1);
    const removed = removeMarkerBlock(twice);
    expect(removed).not.toContain("plantrail");
  });
});
