type LogLevel = "debug" | "info" | "warn" | "error";

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const min = process.env.LOG_LEVEL as LogLevel | undefined;
  const threshold = min && min in levelWeight ? levelWeight[min] : levelWeight.info;
  if (levelWeight[level] < threshold) return;

  const line = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  const json = JSON.stringify(line, serializeErrors);
  if (level === "error") {
    console.error(json);
    return;
  }
  console.log(json);
}

/** Error instances have no enumerable fields, so JSON.stringify would print `{}`. */
function serializeErrors(_key: string, value: unknown): unknown {
  return value instanceof Error ? value.message : value;
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => emit("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => emit("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit("error", message, meta),
};
