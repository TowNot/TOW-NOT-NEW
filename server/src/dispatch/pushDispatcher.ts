import { isPoliceType } from "../engine/wazeAggregator";
import { claimIncidentPush, logSkippedPush } from "../engine/pushDedup";
import { logger } from "../logger";
import { incidentToPushPayload } from "../push";
import { enqueueDispatchNotification } from "../queue/notificationQueue";
import { buildSmsBody } from "../sms/twilioClient";
import type { Incident, PushPayload, PushReceipt } from "../types/incident";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

export interface PushChannel {
  send(payload: PushPayload, options?: { sendSms?: boolean; smsBody?: string }): Promise<void>;
}

/** Enqueues Progressier (+ optional SMS) onto BullMQ — does not block on delivery. */
export class QueuedPushChannel implements PushChannel {
  async send(
    payload: PushPayload,
    options?: { sendSms?: boolean; smsBody?: string },
  ): Promise<void> {
    const jobId = await enqueueDispatchNotification({
      push: payload,
      sendSms: Boolean(options?.sendSms && options.smsBody),
      ...(options?.smsBody ? { smsBody: options.smsBody } : {}),
    });
    logger.debug("Notification enqueued", {
      jobId,
      incidentId: payload.incidentId,
      sendSms: Boolean(options?.sendSms),
    });
  }
}

export class PushDispatcher extends EventEmitter {
  private readonly receipts: PushReceipt[] = [];
  private readonly maxReceipts = 100;

  constructor(private readonly channel: PushChannel = new QueuedPushChannel()) {
    super();
  }

  async sendTest(): Promise<PushReceipt> {
    return this.send(
      {
        title: "AlertNav test alert",
        body: "Push dispatcher is online for London, ON.",
        severity: "medium",
        url: "/desk",
      },
      "test",
    );
  }

  async send(
    payload: PushPayload,
    channel: PushReceipt["channel"] = "dispatch",
    options?: { sendSms?: boolean; smsBody?: string },
  ): Promise<PushReceipt> {
    if (!payload.title?.trim() || !payload.body?.trim()) {
      throw new Error("Push payload requires title and body");
    }

    await this.channel.send(payload, options);

    const receipt: PushReceipt = {
      id: randomUUID(),
      channel,
      payload,
      sentAt: new Date().toISOString(),
    };
    this.receipts.unshift(receipt);
    if (this.receipts.length > this.maxReceipts) this.receipts.pop();
    this.emit("sent", receipt);
    return receipt;
  }

  async notifyIncident(incident: Incident): Promise<PushReceipt | null> {
    const claim = claimIncidentPush(incident);
    if (!claim.ok) {
      logSkippedPush(incident.id, claim.reason);
      return null;
    }

    const push = incidentToPushPayload(incident);
    // Police is push opt-in only — do not SMS every Twilio subscriber.
    const sendSms = !isPoliceType(incident.type, incident.subtype ?? null);
    return this.send(push, "dispatch", {
      sendSms,
      ...(sendSms ? { smsBody: buildSmsBody(incident) } : {}),
    });
  }

  listRecent(limit = 20): PushReceipt[] {
    return this.receipts.slice(0, limit);
  }
}
