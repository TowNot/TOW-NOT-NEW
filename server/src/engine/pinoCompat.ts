import { logger as base } from "../logger";

type Meta = Record<string, unknown>;

function adapt(level: "debug" | "info" | "warn" | "error") {
  return (metaOrMessage: unknown, message?: string): void => {
    if (typeof metaOrMessage === "string") {
      base[level](metaOrMessage);
      return;
    }
    const meta =
      metaOrMessage && typeof metaOrMessage === "object"
        ? (metaOrMessage as Meta)
        : {};
    base[level](message ?? level, meta);
  };
}

export const logger = {
  debug: adapt("debug"),
  info: adapt("info"),
  warn: adapt("warn"),
  error: adapt("error"),
};
