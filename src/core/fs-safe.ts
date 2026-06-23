import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

export function readText(path: string): string {
  return readFileSync(path, "utf8");
}

export function writeText(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

export function readJson<T>(path: string): T {
  return JSON.parse(readText(path)) as T;
}

export function writeJson(path: string, value: unknown): void {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function backupFile(path: string): string | null {
  if (!existsSync(path)) return null;
  const backup = `${path}.bak`;
  copyFileSync(path, backup);
  return backup;
}

export function restoreBackup(path: string, backup: string | null): void {
  if (backup && existsSync(backup)) {
    copyFileSync(backup, path);
  }
}

export function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeText(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}

const MARKER_START = "# >>> plantrail >>>";
const MARKER_END = "# <<< plantrail <<<";

export function injectMarkerBlock(existing: string, block: string): string {
  const wrapped = `${MARKER_START}\n${block.trim()}\n${MARKER_END}`;
  const start = existing.indexOf(MARKER_START);
  const end = existing.indexOf(MARKER_END);
  if (start !== -1 && end !== -1 && end > start) {
    return `${existing.slice(0, start)}${wrapped}${existing.slice(end + MARKER_END.length)}`;
  }
  const sep = existing.endsWith("\n") || existing.length === 0 ? "" : "\n";
  return `${existing}${sep}\n${wrapped}\n`;
}

export function removeMarkerBlock(existing: string): string {
  const start = existing.indexOf(MARKER_START);
  const end = existing.indexOf(MARKER_END);
  if (start === -1 || end === -1 || end <= start) return existing;
  return `${existing.slice(0, start)}${existing.slice(end + MARKER_END.length)}`.trimEnd() + "\n";
}

export function appendMarkdownSection(path: string, heading: string, body: string): void {
  const ts = new Date().toISOString();
  const block = `\n## ${heading} (${ts})\n\n${body.trim()}\n`;
  const current = existsSync(path) ? readText(path) : "";
  writeText(path, `${current}${block}`);
}

export function appendJsonl(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const line = `${JSON.stringify(value)}\n`;
  if (existsSync(path)) {
    writeFileSync(path, line, { flag: "a" });
  } else {
    writeFileSync(path, line);
  }
}
