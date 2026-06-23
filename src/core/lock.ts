import { closeSync, existsSync, mkdirSync, openSync, unlinkSync, writeSync } from "node:fs";
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
