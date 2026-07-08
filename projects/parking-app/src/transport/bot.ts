import { Bot } from "grammy";
import { emptyState, type Config, type ConversationState, type Providers } from "../domain/types.js";
import { handleMessage } from "../core/handleMessage.js";

const HELP = [
  "🅿️ I find car parks in Singapore near where you're driving.",
  "",
  "Just tell me your destination in plain language — a place name",
  '("Marina Bay Sands"), an address, or a 6-digit postal code.',
  "",
  "I'll reply with up to 3 nearby car parks and how many lots are free,",
  "flagging any that are running low. Not happy with them? Ask for",
  '"something else" and I\'ll suggest the next ones.',
].join("\n");

/**
 * Thin grammY adapter (ADR-0001): long-polling, owner whitelist, in-memory
 * per-chat conversation state. No business logic — it delegates to the core.
 */
export function createBot(token: string, providers: Providers, config: Config): Bot {
  const bot = new Bot(token);
  const states = new Map<number, ConversationState>();

  const isOwner = (userId: number | undefined) => userId === config.ownerTelegramId;

  bot.command("start", async (ctx) => {
    if (!isOwner(ctx.from?.id)) return; // ignore non-owners entirely
    await ctx.reply(HELP);
  });

  bot.on("message:text", async (ctx) => {
    const fromUserId = ctx.from?.id;
    if (fromUserId === undefined) return;

    const chatId = ctx.chat.id;
    const state = states.get(chatId) ?? emptyState();

    const { reply, newState } = await handleMessage(
      { text: ctx.message.text, fromUserId },
      state,
      providers,
      config,
    );

    states.set(chatId, newState);
    if (reply) await ctx.reply(reply);
  });

  bot.catch((err) => {
    console.error("Bot error while handling update:", err.error);
  });

  return bot;
}
