import { DEFAULT_TUNING, type Config } from "./domain/types.js";

export interface AppConfig {
  telegramBotToken: string;
  anthropicApiKey: string;
  anthropicModel: string | undefined;
  ltaAccountKey: string;
  core: Config;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function numberOr(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Environment variable ${name} must be a number, got: ${raw}`);
  return value;
}

/** Load and validate configuration from the environment (see .env.example). */
export function loadConfig(): AppConfig {
  const ownerTelegramId = Number(required("OWNER_TELEGRAM_ID"));
  if (!Number.isInteger(ownerTelegramId)) {
    throw new Error("OWNER_TELEGRAM_ID must be an integer Telegram user ID");
  }

  return {
    telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
    anthropicApiKey: required("ANTHROPIC_API_KEY"),
    anthropicModel: process.env.ANTHROPIC_MODEL?.trim() || undefined,
    ltaAccountKey: required("LTA_ACCOUNT_KEY"),
    core: {
      ownerTelegramId,
      lowAvailabilityPercent: numberOr("LOW_AVAILABILITY_PERCENT", DEFAULT_TUNING.lowAvailabilityPercent),
      lowAvailabilityFloor: numberOr("LOW_AVAILABILITY_FLOOR", DEFAULT_TUNING.lowAvailabilityFloor),
      primaryRadiusMeters: DEFAULT_TUNING.primaryRadiusMeters,
      widenedRadiusMeters: DEFAULT_TUNING.widenedRadiusMeters,
      maxSuggestions: DEFAULT_TUNING.maxSuggestions,
    },
  };
}
