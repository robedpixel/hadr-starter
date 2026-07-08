import "dotenv/config";
import { loadConfig } from "./config.js";
import { createBot } from "./transport/bot.js";
import { createAnthropicLlm } from "./providers/llm.js";
import { createOneMapGeocoder } from "./providers/geocoder.js";
import { createLtaCarparkProvider } from "./providers/carpark.js";
import type { Providers } from "./domain/types.js";

async function main() {
  const config = loadConfig();

  const providers: Providers = {
    llm: createAnthropicLlm(config.anthropicApiKey, config.anthropicBaseUrl),
    geocoder: createOneMapGeocoder(),
    carparks: createLtaCarparkProvider(config.ltaAccountKey),
  };

  const bot = createBot(config.telegramBotToken, providers, config.core);

  console.log("Parking bot starting (long-polling). Owner:", config.core.ownerTelegramId);
  await bot.start({
    onStart: (info) => console.log(`Connected as @${info.username}`),
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
