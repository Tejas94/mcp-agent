type Level = "info" | "warn" | "error";

function log(level: Level, message: string): void {
  console.log(`${new Date().toISOString()} [${level}] ${message}`);
}

export const logger = {
  info: (message: string) => log("info", message),
  warn: (message: string) => log("warn", message),
  error: (message: string) => log("error", message),
};
