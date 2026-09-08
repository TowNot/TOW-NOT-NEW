import { config } from "../config";
import { logger } from "../logger";
import { incidentToPushPayload } from "../push";
import type { Incident } from "../types/incident";
import { pushCategoryForIncident, type PushCategory } from "../engine/pushCategories";
import { listSmsRecipientsForCategory, listSmsSubscribers } from "./subscribers";

type TwilioMessages = {
  messages: {
    create: (opts: { to: string; from: string; body: string }) => Promise<{ sid?: string }>;
  };
};

let client: TwilioMessages | null | undefined;

function getTwilio(): TwilioMessages | null {
  if (client !== undefined) return client;
  if (!config.twilioAccountSid || !config.twilioAuthToken) {
    client = null;
    return null;
  }
  try {
    // Avoid a static `require("twilio")` so tsc does not load Twilio's type graph.
    const load = eval("require") as (id: string) => (sid: string, token: string) => TwilioMessages;
    client = load("twilio")(config.twilioAccountSid, config.twilioAuthToken);
    return client;
  } catch (error) {
    logger.error("Twilio client failed to initialize", {
      error: error instanceof Error ? error.message : String(error),
    });
    client = null;
    return null;
  }
}

export function isTwilioConfigured(): boolean {
  return Boolean(config.twilioAccountSid && config.twilioAuthToken && config.twilioFromNumber);
}

function smsBody(incident: Incident): string {
  const payload = incidentToPushPayload(incident);
  return `${payload.title}\n${payload.body}`.slice(0, 1500);
}

async function sendOne(to: string, body: string): Promise<void> {
  const twilio = getTwilio();
  if (!twilio) return;
  await twilio.messages.create({
    to,
    from: config.twilioFromNumber,
    body,
  });
}

/** Build the SMS text for an incident (shared by queue producer + legacy callers). */
export function buildSmsBody(incident: Incident): string {
  return smsBody(incident);
}

/**
 * Awaitable SMS fan-out for the notification worker.
 * Individual recipient failures are logged; does not throw (push already sent).
 * When `category` is set, only subscribers who opted into that desk category get texts.
 */
export async function dispatchSmsBody(
  body: string,
  incidentId?: string,
  category?: PushCategory,
): Promise<void> {
  if (!isTwilioConfigured()) return;
  const recipients = category
    ? await listSmsRecipientsForCategory(category)
    : await listSmsSubscribers();
  if (recipients.length === 0) {
    logger.info("Twilio SMS dispatch skipped — no matching recipients", {
      incidentId,
      category: category ?? "all",
    });
    return;
  }

  const results = await Promise.allSettled(recipients.map((to) => sendOne(to, body)));
  const failed = results.filter((r) => r.status === "rejected").length;
  logger.info("Twilio SMS dispatch finished", {
    incidentId,
    category: category ?? "all",
    sent: results.length - failed,
    failed,
  });
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      logger.warn("Twilio SMS failed", {
        to: recipients[i],
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });
}

/** Fire-and-forget SMS to category-matched numbers. Never throws to the caller. */
export function notifySmsSubscribers(incident: Incident): void {
  void dispatchSmsBody(
    buildSmsBody(incident),
    incident.id,
    pushCategoryForIncident(incident),
  ).catch((error: unknown) => {
    logger.warn("Twilio SMS dispatch aborted", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
