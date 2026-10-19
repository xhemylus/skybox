import path from "node:path";
import { Worker } from "node:worker_threads";
import type { ReplayData } from "@skybox/shared";

type ProgressFn = (pct: number, stage: string) => void | Promise<void>;

/**
 * Parse a demo on a worker thread so progress DB writes can flush on the main loop.
 */
export function parseDemoAsync(
  demoPath: string,
  filename: string | null | undefined,
  onProgress: ProgressFn,
): Promise<ReplayData> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "parseThread.js"), {
      workerData: { demoPath, filename: filename ?? null },
    });

    let chain: Promise<void> = Promise.resolve();
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
      void worker.terminate();
    };

    worker.on("message", (msg: { type: string; pct?: number; stage?: string; replay?: ReplayData; error?: string }) => {
      if (msg.type === "progress" && msg.pct != null && msg.stage != null) {
        chain = chain
          .then(() => onProgress(msg.pct!, msg.stage!))
          .catch((err) => console.warn("[parse] progress update failed", err));
        return;
      }
      if (msg.type === "done" && msg.replay) {
        chain
          .then(() => finish(() => resolve(msg.replay!)))
          .catch((err) => finish(() => reject(err)));
        return;
      }
      if (msg.type === "error") {
        finish(() => reject(new Error(msg.error ?? "Parse thread error")));
      }
    });

    worker.on("error", (err) => finish(() => reject(err)));
    worker.on("exit", (code) => {
      if (!settled && code !== 0) {
        finish(() => reject(new Error(`Le thread de parse s'est arrêté (code ${code}). Souvent OOM — ajoute du swap ou PARSE_SAMPLE_STEP plus haut.`)));
      }
    });
  });
}
