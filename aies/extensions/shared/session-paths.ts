import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";

const SESSION_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z_[^.]+\.jsonl$/;

function sessionSortKey(sessionPath: string): string | null {
  const name = basename(sessionPath);
  return SESSION_FILE_PATTERN.test(name) ? name : null;
}

export function compareSessionPathsByRecency(left: string, right: string): number {
  const leftKey = sessionSortKey(left);
  const rightKey = sessionSortKey(right);

  if (leftKey && rightKey && leftKey !== rightKey) {
    return rightKey.localeCompare(leftKey);
  }

  if (leftKey && !rightKey) {
    return -1;
  }

  if (!leftKey && rightKey) {
    return 1;
  }

  const mtimeDelta = statSync(right).mtimeMs - statSync(left).mtimeMs;
  if (mtimeDelta !== 0) {
    return mtimeDelta;
  }

  return basename(right).localeCompare(basename(left));
}

export function listSessionPathsByRecency(sessionDir: string): string[] {
  if (!existsSync(sessionDir)) {
    return [];
  }

  return readdirSync(sessionDir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => resolve(sessionDir, name))
    .sort(compareSessionPathsByRecency);
}

export function latestSessionPathByRecency(sessionDir: string): string | null {
  return listSessionPathsByRecency(sessionDir)[0] ?? null;
}
