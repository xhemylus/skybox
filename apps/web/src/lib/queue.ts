import { Queue } from "bullmq";
import { PARSE_QUEUE_NAME, type ParseJob } from "@skybox/shared";
import { env } from "./env";

let queue: Queue<ParseJob> | null = null;

export function getParseQueue() {
  if (!queue) {
    queue = new Queue<ParseJob>(PARSE_QUEUE_NAME, {
      connection: { url: env.redisUrl },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  }
  return queue;
}

export async function enqueueParse(job: ParseJob) {
  await getParseQueue().add("parse", job, { jobId: `${job.matchId}-${Date.now()}` });
}
