import { Worker, type Job } from "bullmq";
import { logger } from "../logger";
import { sendProgressierPush } from "../push";
import {
  DISPATCH_NOTIFICATIONS_QUEUE,
  type DispatchNotificationJobData,
} from "../queue/notificationQueue";
import { createRedisConnection } from "../queue/connection";
import { dispatchSmsBody } from "../sms/twilioClient";

/** Safe concurrency for Progressier + Twilio fan-out under multi-city load. */
const WORKER_CONCURRENCY = 5;

async function processDispatchNotification(
  job: Job<DispatchNotificationJobData>,
): Promise<void> {
  const { push, sendSms, smsBody } = job.data;
  const incidentId = push.incidentId;

  logger.debug("Notification worker processing job", {
    jobId: job.id,
    incidentId,
    attempt: job.attemptsMade + 1,
    sendSms,
  });

  // Web push first — this is the primary channel.
  await sendProgressierPush(push);

  if (sendSms && smsBody?.trim()) {
    await dispatchSmsBody(smsBody, incidentId);
  }

  logger.info("Notification worker completed job", {
    jobId: job.id,
    incidentId,
  });
}

let worker: Worker<DispatchNotificationJobData> | null = null;

/**
 * Start the BullMQ worker that executes Progressier + Twilio off the
 * main ingest / HTTP event loop turn.
 */
export function startNotificationWorker(): Worker<DispatchNotificationJobData> {
  if (worker) return worker;

  worker = new Worker<DispatchNotificationJobData>(
    DISPATCH_NOTIFICATIONS_QUEUE,
    processDispatchNotification,
    {
      connection: createRedisConnection(),
      concurrency: WORKER_CONCURRENCY,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error("Notification job failed", {
      jobId: job?.id,
      incidentId: job?.data.push.incidentId,
      attemptsMade: job?.attemptsMade,
      error: err.message,
    });
  });

  worker.on("error", (err) => {
    logger.error("Notification worker error", { error: err.message });
  });

  logger.info("Notification worker started", {
    queue: DISPATCH_NOTIFICATIONS_QUEUE,
    concurrency: WORKER_CONCURRENCY,
  });

  return worker;
}

export async function stopNotificationWorker(): Promise<void> {
  if (!worker) return;
  await worker.close();
  worker = null;
}
