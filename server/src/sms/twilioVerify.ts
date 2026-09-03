import { config } from "../config";
import { logger } from "../logger";
import { toE164 } from "./e164";

type TwilioVerifyClient = {
  verify: {
    v2: {
      services: (serviceSid: string) => {
        verifications: {
          create: (opts: { to: string; channel: "sms" }) => Promise<{ status: string }>;
        };
        verificationChecks: {
          create: (opts: { to: string; code: string }) => Promise<{ status: string }>;
        };
      };
    };
  };
};

let client: TwilioVerifyClient | null | undefined;

function getTwilioVerifyClient(): TwilioVerifyClient | null {
  if (client !== undefined) return client;
  if (!config.twilioAccountSid || !config.twilioAuthToken) {
    client = null;
    return null;
  }
  try {
    const load = eval("require") as (id: string) => (sid: string, token: string) => TwilioVerifyClient;
    client = load("twilio")(config.twilioAccountSid, config.twilioAuthToken);
    return client;
  } catch (error) {
    logger.error("Twilio Verify client failed to initialize", {
      error: error instanceof Error ? error.message : String(error),
    });
    client = null;
    return null;
  }
}

export function isTwilioVerifyConfigured(): boolean {
  return Boolean(
    config.twilioAccountSid &&
      config.twilioAuthToken &&
      config.twilioVerifyServiceSid,
  );
}

const RESEND_COOLDOWN_MS = 60_000;
const lastSendByPhone = new Map<string, number>();

function assertVerifyReady(): void {
  if (!isTwilioVerifyConfigured()) {
    throw new Error("SMS verification is not configured on the server");
  }
}

function normalizePhone(raw: string): string {
  const phone = toE164(raw);
  if (!phone) {
    throw new Error("Enter a valid phone number, e.g. 519-555-1212 or +15195551212");
  }
  return phone;
}

function twilioVerifyUserMessage(error: unknown, fallback: string): string {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const lower = message.toLowerCase();
  if (lower.includes("max") && lower.includes("attempt")) {
    return "Too many attempts — wait a few minutes and try again";
  }
  if (lower.includes("invalid parameter") || lower.includes("invalid 'to'")) {
    return "Enter a valid mobile number that can receive SMS";
  }
  if (lower.includes("not found") || lower.includes("was not found")) {
    return "SMS verification service is not available — try again later";
  }
  if (lower.includes("authenticate") || lower.includes("unauthorized")) {
    return "SMS verification is not configured on the server";
  }
  return fallback;
}

/** Send a one-time verification code via Twilio Verify (SMS). */
export async function sendSmsVerificationCode(rawPhone: string): Promise<{ phone: string }> {
  assertVerifyReady();
  const phone = normalizePhone(rawPhone);

  const lastSent = lastSendByPhone.get(phone) ?? 0;
  const elapsed = Date.now() - lastSent;
  if (elapsed < RESEND_COOLDOWN_MS) {
    const waitSec = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
    throw new Error(`Wait ${waitSec}s before requesting another code`);
  }

  const twilio = getTwilioVerifyClient();
  if (!twilio) {
    throw new Error("SMS verification is not configured on the server");
  }

  try {
    const verification = await twilio.verify.v2
      .services(config.twilioVerifyServiceSid)
      .verifications.create({ to: phone, channel: "sms" });

    const status = (verification.status ?? "").toLowerCase();
    if (status === "canceled" || status === "failed" || status === "undelivered") {
      throw new Error("Unable to send verification code — try again in a moment");
    }

    lastSendByPhone.set(phone, Date.now());
    logger.info("[Twilio Verify] sent SMS code", { phone, status: status || "pending" });
    return { phone };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Wait ")) throw error;
    if (error instanceof Error && error.message.startsWith("Unable to send")) throw error;
    logger.warn("[Twilio Verify] send failed", {
      phone,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(twilioVerifyUserMessage(error, "Unable to send verification code — try again in a moment"));
  }
}

/** Confirm OTP; returns normalized E.164 when approved. */
export async function verifySmsVerificationCode(
  rawPhone: string,
  rawCode: string,
): Promise<{ phone: string }> {
  assertVerifyReady();
  const phone = normalizePhone(rawPhone);
  const code = rawCode.trim();
  if (!/^\d{4,8}$/.test(code)) {
    throw new Error("Enter the verification code from your text message");
  }

  const twilio = getTwilioVerifyClient();
  if (!twilio) {
    throw new Error("SMS verification is not configured on the server");
  }

  try {
    const check = await twilio.verify.v2
      .services(config.twilioVerifyServiceSid)
      .verificationChecks.create({ to: phone, code });

    if (check.status !== "approved") {
      throw new Error("Invalid or expired verification code");
    }

    lastSendByPhone.delete(phone);
    logger.info("[Twilio Verify] phone verified", { phone });
    return { phone };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid or expired")) throw error;
    logger.warn("[Twilio Verify] check failed", {
      phone,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(twilioVerifyUserMessage(error, "Invalid or expired verification code"));
  }
}
