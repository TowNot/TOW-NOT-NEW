import { isPoliceType } from "../engine/wazeAggregator";
import { claimIncidentPush, logSkippedPush } from "../engine/pushDedup";
import { logger } from "../logger";
import { incidentToPushPayload, sendProgressierPush } from "../push";
import { notifySmsSubscribers } from "../sms/twilioClient";
import type { Incident, PushPayload, PushReceipt } from "../types/incident";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

export interface PushChannel {
  send(payload: PushPayload): Promise<void>;
}

export class ProgressierPushChannel implements PushChannel {
  async send(payload: PushPayload): Promise<void> {
    await sendProgressierPush(payload);
    logger.info("Progressier push dispatched", {
      title: payload.title,
      incidentId: payload.incidentId,
    });
  }
}

export class PushDispatcher extends EventEmitter {
  private readonly receipts: PushReceipt[] = [];
  private readonly maxReceipts = 100;

  constructor(private readonly channel: PushChannel = new ProgressierPushChannel()) {
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

  async send(payload: PushPayload, channel: PushReceipt["channel"] = "dispatch"): Promise<PushReceipt> {
    if (!payload.title?.trim() || !payload.body?.trim()) {
      throw new Error("Push payload requires title and body");
    }

    await this.channel.send(payload);

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

    // Police is push opt-in only — do not SMS every Twilio subscriber.
    if (!isPoliceType(incident.type, incident.subtype ?? null)) {
      try {
        notifySmsSubscribers(incident);
      } catch (error) {
        logger.warn("Twilio SMS dispatch skipped", {
          incidentId: incident.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return this.send(incidentToPushPayload(incident));
  }

  listRecent(limit = 20): PushReceipt[] {
    return this.receipts.slice(0, limit);
  }
}
