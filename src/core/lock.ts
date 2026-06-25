import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import { runLockPath } from "../paths.js";

export class RunLock {
  private fd: number | null = null;
  private readonly lockPath: string;

  constructor(projectRoot: string, runId: string) {
    this.lockPath = runLockPath(projectRoot, runId);
  }

  acquire(): void {
    if (this.fd !== null) return;
    mkdirSync(dirname(this.lockPath), { recursive: true });
    const fd = openSync(this.lockPath, "wx");
    writeSync(fd, `${process.pid}\n`);
    this.fd = fd;
  }

  release(): void {
    if (this.fd !== null) {
      closeSync(this.fd);
      this.fd = null;
    }
    if (existsSync(this.lockPath)) {
      unlinkSync(this.lockPath);
    }
  }
}

export function withRunLock<T>(projectRoot: string, runId: string, fn: () => T): T {
  const lock = new RunLock(projectRoot, runId);
  lock.acquire();
  try {
    return fn();
  } finally {
    lock.release();
  }
}

/**
 * Attempts to acquire the run lock, handling stale locks and retrying synchronously.
 * Returns fn() result on success, or fallback() if the lock cannot be acquired within timeoutMs.
 */
export function withRunLockRetry<T>(
  projectRoot: string,
  runId: string,
  fn: () => T,
  fallback: () => T,
  timeoutMs = 3000,
): T {
  const lockPath = runLockPath(projectRoot, runId);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      mkdirSync(dirname(lockPath), { recursive: true });
      const fd = openSync(lockPath, "wx");
      writeSync(fd, `${process.pid}\n`);
      try {
        return fn();
      } finally {
        closeSync(fd);
        if (existsSync(lockPath)) unlinkSync(lockPath);
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      // Lock file exists — check if it's stale
      if (isLockStale(lockPath)) {
        try { unlinkSync(lockPath); } catch { /* already gone */ }
        continue;
      }
      // Spin-wait 50ms before retry
      const end = Date.now() + 50;
      while (Date.now() < end) { /* busy wait — short */ }
    }
  }
  return fallback();
}

function isLockStale(lockPath: string): boolean {
  try {
    const content = readFileSync(lockPath, "utf8").trim();
    const pid = parseInt(content, 10);
    // Empty / invalid pid: a lock may have just been created (openSync before writeSync).
    // Be conservative and do NOT treat as stale, to avoid deleting a live lock.
    if (!Number.isFinite(pid) || pid <= 0) return false;
    // On POSIX, kill(pid, 0) probes process existence without sending a signal.
    try {
      process.kill(pid, 0);
      return false; // process exists and we can signal it
    } catch (err: unknown) {
      // EPERM => the process exists but is owned by another user => NOT stale.
      // ESRCH => no such process => stale.
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EPERM") return false;
      return code === "ESRCH";
    }
  } catch {
    // Could not read/parse the lock file — be conservative and do NOT treat as stale,
    // to avoid deleting a lock that another process just created.
    return false;
  }
}
