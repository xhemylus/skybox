/**
 * Runs inside worker_threads so the main BullMQ process can keep updating
 * parse_progress in Postgres while demoparser2 blocks on CPU.
 */
import { parentPort, workerData } from "node:worker_threads";
import { parseDemo } from "./parseDemo";

type Data = { demoPath: string; filename: string | null };

async function main() {
  const port = parentPort;
  if (!port) throw new Error("parseThread must run as a worker_thread");
  const { demoPath, filename } = workerData as Data;

  try {
    const replay = parseDemo(demoPath, {
      filename,
      onProgress: (pct, stage) => {
        port.postMessage({ type: "progress", pct, stage });
      },
    });
    port.postMessage({ type: "done", replay });
  } catch (err) {
    port.postMessage({
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

main();
