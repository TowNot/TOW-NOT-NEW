import { type FormEvent, useEffect, useState } from "react";

const STORAGE_KEY = "alertnav-sms-phone";

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

interface SmsSettingsProps {
  embedded?: boolean;
}

export function SmsSettings({ embedded = false }: SmsSettingsProps) {
  const [phone, setPhone] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);

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
    void fetch("/api/sms/status", { credentials: "include" })
      .then(async (res) => {
        if (res.status === 401) {
          setConfigured(null);
          setError("Sign in to manage SMS alerts");
          return;
        }
        const body = (await res.json()) as { configured?: boolean };
        setConfigured(Boolean(body.configured));
      })
      .catch(() => setConfigured(null));
  }, []);

  const persistLocal = (e164: string) => {
    setSaved(e164);
    setPhone(e164);
    try {
      window.localStorage.setItem(STORAGE_KEY, e164);
    } catch {
      // Ignore quota / private mode.
    }
  };

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/sms/opt-in", {
        method: "POST",
        credentials: "include",
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

  const onRemove = async () => {
    const target = saved || phone;
    if (!target) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/sms/opt-in", {
        method: "DELETE",
        credentials: "include",
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

  const content = (
    <>
      {!embedded ? (
        <h2 className="text-sm font-semibold tracking-[0.18em] uppercase text-foreground">
          SMS alerts
        </h2>
      ) : null}
      <p className={`text-xs text-muted ${embedded ? "" : "mt-1"}`}>
        Opt in to text messages for Waze and fire incidents. Numbers are stored as E.164
        (e.g. +15195551212).
      </p>
      {configured === false ? (
        <p className="mt-2 font-mono text-[11px] text-amber-600">
          Twilio is not configured on the server yet — your number will still be saved.
        </p>
      ) : null}
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => void onSave(e)}>
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
            Mobile number
          </span>
          <input
            type="tel"
            name="phone"
            autoComplete="tel"
            placeholder="519-555-1212"
            value={phone}
            onChange={(event) => setPhone(formatAsYouType(event.target.value))}
            className="input-field"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !phone.trim()}
          className="btn-primary px-4 py-2 text-xs disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save number"}
        </button>
        <button
          type="button"
          onClick={() => void onRemove()}
          disabled={busy || !(saved || phone.trim())}
          className="btn-ghost px-4 py-2 text-xs disabled:opacity-60"
        >
          Turn off SMS
        </button>
      </form>
      {saved ? (
        <p className="mt-2 font-mono text-[11px] text-muted">Saved as {saved}</p>
      ) : null}
      {message ? (
        <p className="mt-2 text-xs text-accent-deep">{message}</p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      ) : null}
    </>
  );

  if (embedded) {
    return <div className="sms-settings-embedded">{content}</div>;
  }

  return <section className="surface-card px-4 py-4">{content}</section>;
}
