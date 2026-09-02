import { type FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../lib/apiFetch";

const STORAGE_KEY = "alertnav-sms-phone";

type SmsStep = "phone" | "verify";

function formatAsYouType(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("+")) {
    return `+${trimmed.slice(1).replace(/\D/g, "").slice(0, 15)}`;
  }
  const digits = trimmed.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return `+${digits}`;
}

export function SmsSettings() {
  const [phone, setPhone] = useState("");
  const [pendingPhone, setPendingPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<SmsStep>("phone");
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [verifyConfigured, setVerifyConfigured] = useState<boolean | null>(null);

  const otpRequired = verifyConfigured === true;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setPhone(stored);
        setSaved(stored);
      }
    } catch {
      // Private browsing.
    }
    void apiFetch("/api/sms/status")
      .then(async (res) => {
        if (res.status === 401) {
          setConfigured(null);
          setVerifyConfigured(null);
          setError("Sign in to manage SMS alerts");
          return;
        }
        const body = (await res.json()) as { configured?: boolean; verifyConfigured?: boolean };
        setConfigured(Boolean(body.configured));
        setVerifyConfigured(Boolean(body.verifyConfigured));
      })
      .catch(() => {
        setConfigured(null);
        setVerifyConfigured(null);
      });
  }, []);

  const persistLocal = (e164: string) => {
    setSaved(e164);
    setPhone(e164);
    setPendingPhone("");
    setCode("");
    setStep("phone");
    try {
      window.localStorage.setItem(STORAGE_KEY, e164);
    } catch {
      // Ignore quota / private mode.
    }
  };

  const resetVerification = () => {
    setStep("phone");
    setPendingPhone("");
    setCode("");
    setError(null);
    setMessage(null);
  };

  const onSaveDirect = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await apiFetch("/api/sms/opt-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const body = (await response.json()) as { phone?: string; error?: string; created?: boolean };
      if (response.status === 401) {
        throw new Error("Sign in to manage SMS alerts");
      }
      if (!response.ok || !body.phone) {
        throw new Error(body.error ?? "Unable to save phone number");
      }
      persistLocal(body.phone);
      setMessage(
        body.created
          ? `SMS alerts on for ${body.phone}`
          : `${body.phone} is already opted in`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save phone number");
    } finally {
      setBusy(false);
    }
  };

  const onSendCode = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await apiFetch("/api/sms/verify/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const body = (await response.json()) as { phone?: string; error?: string };
      if (response.status === 401) {
        throw new Error("Sign in to manage SMS alerts");
      }
      if (!response.ok || !body.phone) {
        throw new Error(body.error ?? "Unable to send verification code");
      }
      setPendingPhone(body.phone);
      setStep("verify");
      setMessage(`Verification code sent to ${body.phone}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send verification code");
    } finally {
      setBusy(false);
    }
  };

  const onConfirmCode = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await apiFetch("/api/sms/opt-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: pendingPhone || phone, code }),
      });
      const body = (await response.json()) as {
        phone?: string;
        error?: string;
        created?: boolean;
      };
      if (response.status === 401) {
        throw new Error("Sign in to manage SMS alerts");
      }
      if (!response.ok || !body.phone) {
        throw new Error(body.error ?? "Unable to save phone number");
      }
      persistLocal(body.phone);
      setMessage(
        body.created
          ? `SMS alerts on for ${body.phone}`
          : `${body.phone} is already opted in`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save phone number");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    const target = saved || phone;
    if (!target) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await apiFetch("/api/sms/opt-in", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: target }),
      });
      const body = (await response.json()) as { error?: string };
      if (response.status === 401) {
        throw new Error("Sign in to manage SMS alerts");
      }
      if (!response.ok) {
        throw new Error(body.error ?? "Unable to remove phone number");
      }
      setSaved(null);
      setPhone("");
      resetVerification();
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore.
      }
      setMessage("SMS alerts turned off");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to remove phone number");
    } finally {
      setBusy(false);
    }
  };

  const verificationTarget = pendingPhone || phone;

  return (
    <section className="rounded-lg border border-line bg-panel px-4 py-4">
      <h2 className="text-sm font-semibold tracking-[0.18em] uppercase text-gray-900">
        SMS alerts
      </h2>
      <p className="mt-1 text-xs text-gray-500">
        {otpRequired
          ? "Opt in to text messages for Waze and fire incidents. We verify your number with a one-time code before saving it."
          : "Opt in to text messages for Waze and fire incidents. Numbers are stored as E.164 (e.g. +15195551212)."}
      </p>
      {configured === false ? (
        <p className="mt-2 font-mono text-[11px] text-amber-700">
          Twilio is not configured on the server yet — your number will still be saved.
        </p>
      ) : null}

      {verifyConfigured === null ? (
        <p className="mt-3 text-xs text-gray-500">Loading SMS settings…</p>
      ) : null}

      {verifyConfigured !== null && !otpRequired && step === "phone" ? (
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => void onSaveDirect(e)}>
          <label className="flex min-w-[16rem] flex-1 flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-gray-500">
              Mobile number
            </span>
            <input
              type="tel"
              name="phone"
              autoComplete="tel"
              placeholder="519-555-1212"
              value={phone}
              onChange={(event) => setPhone(formatAsYouType(event.target.value))}
              className="rounded-md border border-line bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !phone.trim()}
            className="rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold tracking-wide text-white hover:bg-black disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save number"}
          </button>
          <button
            type="button"
            onClick={() => void onRemove()}
            disabled={busy || !(saved || phone.trim())}
            className="rounded-md border border-line bg-white px-3 py-2 text-xs font-medium tracking-wide text-gray-700 hover:border-gray-400 disabled:opacity-60"
          >
            Turn off SMS
          </button>
        </form>
      ) : null}

      {verifyConfigured !== null && otpRequired && step === "phone" ? (
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => void onSendCode(e)}>
          <label className="flex min-w-[16rem] flex-1 flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-gray-500">
              Mobile number
            </span>
            <input
              type="tel"
              name="phone"
              autoComplete="tel"
              placeholder="519-555-1212"
              value={phone}
              onChange={(event) => setPhone(formatAsYouType(event.target.value))}
              className="rounded-md border border-line bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !phone.trim()}
            className="rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold tracking-wide text-white hover:bg-black disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send verification code"}
          </button>
          <button
            type="button"
            onClick={() => void onRemove()}
            disabled={busy || !(saved || phone.trim())}
            className="rounded-md border border-line bg-white px-3 py-2 text-xs font-medium tracking-wide text-gray-700 hover:border-gray-400 disabled:opacity-60"
          >
            Turn off SMS
          </button>
        </form>
      ) : null}

      {verifyConfigured !== null && otpRequired && step === "verify" ? (
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => void onConfirmCode(e)}>
          <p className="w-full text-xs text-gray-600">
            Enter the code sent to <span className="font-mono">{verificationTarget}</span>.
          </p>
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-gray-500">
              Verification code
            </span>
            <input
              type="text"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
              className="rounded-md border border-line bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
            />
          </label>
          <button
            type="submit"
            disabled={busy || code.trim().length < 4}
            className="rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold tracking-wide text-white hover:bg-black disabled:opacity-60"
          >
            {busy ? "Confirming…" : "Confirm & subscribe"}
          </button>
          <button
            type="button"
            onClick={resetVerification}
            disabled={busy}
            className="rounded-md border border-line bg-white px-3 py-2 text-xs font-medium tracking-wide text-gray-700 hover:border-gray-400 disabled:opacity-60"
          >
            Change number
          </button>
        </form>
      ) : null}

      {saved ? (
        <p className="mt-2 font-mono text-[11px] text-gray-500">Saved as {saved}</p>
      ) : null}
      {message ? (
        <p className="mt-2 text-xs text-emerald-700">{message}</p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-red-700">{error}</p>
      ) : null}
    </section>
  );
}
