import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { logger } from "../logger";
import { incidentToPushPayload, sendProgressierPush } from "../push";
import type { Incident, PushPayload, PushReceipt } from "../types/incident";

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
    return this.send(incidentToPushPayload(incident));
  }

  listRecent(limit = 20): PushReceipt[] {
    return this.receipts.slice(0, limit);
  }
}
