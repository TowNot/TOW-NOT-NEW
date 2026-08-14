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

  if (level === "error") {
    console.error(JSON.stringify(line));
    return;
  }
  console.log(JSON.stringify(line));
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => emit("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => emit("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit("error", message, meta),
};
