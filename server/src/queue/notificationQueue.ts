import { Queue } from "bullmq";
import type { PushPayload } from "../types/incident";
import { createRedisConnection } from "./connection";

export const DISPATCH_NOTIFICATIONS_QUEUE = "dispatchNotifications";

/** Serializable job payload for Progressier web push + optional Twilio SMS. */
export interface DispatchNotificationJobData {
  push: PushPayload;
  /** When true, worker fans out SMS to opted-in numbers using `smsBody`. */
  sendSms: boolean;
  /** Pre-built SMS text (title + body). Required when `sendSms` is true. */
  smsBody?: string;
}

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 2_000,
  },
  removeOnComplete: 1_000,
  removeOnFail: 5_000,
};

let queue: Queue<DispatchNotificationJobData> | null = null;

export function getNotificationQueue(): Queue<DispatchNotificationJobData> {
  if (!queue) {
    queue = new Queue<DispatchNotificationJobData>(DISPATCH_NOTIFICATIONS_QUEUE, {
      connection: createRedisConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
  return queue;
}

/**
 * Enqueue a notification job. Returns as soon as Redis accepts the job —
 * Progressier / Twilio run in the worker process, off the ingest hot path.
 */
export async function enqueueDispatchNotification(
  data: DispatchNotificationJobData,
): Promise<string> {
  const q = getNotificationQueue();
  const jobId = data.push.incidentId
    ? `incident:${data.push.incidentId}`
    : undefined;
  const job = await q.add("notify", data, {
    ...DEFAULT_JOB_OPTIONS,
    ...(jobId ? { jobId } : {}),
  });
  return job.id ?? jobId ?? "unknown";
}

export async function closeNotificationQueue(): Promise<void> {
  if (!queue) return;
  await queue.close();
  queue = null;
}
