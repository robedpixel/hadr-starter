import Anthropic from "@anthropic-ai/sdk";
import type { Interpretation, LlmProvider } from "../domain/types.js";

const DEFAULT_MODEL = "claude-opus-4-8";

type Intent = "parking_request" | "suggest_another" | "other";

/**
 * The model's ONLY job is intent. It does not extract or repeat the destination
 * — that is derived deterministically (see extractDestinationText), so a weaker
 * model can't mangle the place words. A smaller job is a more reliable job.
 */
export const SYSTEM = [
  "You classify short chat messages sent to a personal Singapore parking bot",
  "into exactly one intent. You do NOT extract or repeat the destination — a",
  "separate deterministic step handles that. Only choose the intent.",
  "",
  "Intents:",
  "- parking_request: the user is naming somewhere they want to drive to or park",
  '  (a place name, address, or postal code) — e.g. "Jurong Point", "313 Somerset",',
  '  "I want to go to Marina Bay Sands", "parking near VivoCity".',
  "- suggest_another: the user is asking for different or more options for the",
  '  place already under discussion — e.g. "anything else?", "suggest another",',
  '  "what else", "somewhere closer".',
  "- other: greetings, chit-chat, or anything that is not a destination or a",
  "  request for more options.",
  "",
  "Reply with ONLY a JSON object and nothing else — no prose, no markdown fences:",
  '  {"intent": "parking_request"}',
].join("\n");

/**
 * Deliver the instructions in the USER turn rather than the `system` field.
 * Some Anthropic->OpenAI gateway shims drop or ignore the system prompt for
 * open models, so the model never sees the task; folding it into the user
 * message sidesteps that.
 */
export function buildClassificationPrompt(message: string): string {
  return `${SYSTEM}\n\nMessage to classify:\n"""${message}"""\n\nRespond with the JSON object now.`;
}

// Filler that precedes a destination in natural phrasing; stripped deterministically
// so the geocoder query is just the place words. Longest-first so e.g.
// "i want to go to" wins over "go to".
const FILLER_PREFIXES = [
  "i want to go to",
  "i wanna go to",
  "i want to park at",
  "i want to park near",
  "i am going to",
  "i'm going to",
  "im going to",
  "take me to",
  "bring me to",
  "navigate to",
  "parking near",
  "parking at",
  "park near",
  "park at",
  "heading to",
  "head to",
  "going to",
  "drive to",
  "go to",
].sort((a, b) => b.length - a.length);

/**
 * Deterministic short-circuit: a bare 6-digit string is always a Singapore
 * postal code (the geocoder still validates it), so we never let the model
 * misread it. Returns null when the message needs the model to classify intent.
 */
export function quickClassify(message: string): Interpretation | null {
  const trimmed = message.trim();
  if (/^\d{6}$/.test(trimmed)) {
    return { intent: "parking_request", destinationText: trimmed };
  }
  return null;
}

/**
 * Deterministically derive the geocoder query from a parking-request message:
 * drop a leading filler phrase and trailing punctuation, leaving the place words.
 */
export function extractDestinationText(message: string): string {
  let text = message.trim().replace(/[?!.,]+$/, "").trim();
  const lower = text.toLowerCase();
  for (const prefix of FILLER_PREFIXES) {
    if (lower.startsWith(prefix + " ")) {
      text = text.slice(prefix.length).trim();
      break;
    }
  }
  return text;
}

/**
 * Extract every top-level {...} object from text, ignoring braces inside strings.
 * Weaker models often wrap the answer in reasoning or prose that itself contains
 * braces, so a naive first-`{`-to-last-`}` slice fails — we scan for balanced
 * objects instead.
 */
function extractJsonObjects(text: string): string[] {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}" && depth > 0) {
      depth--;
      if (depth === 0 && start !== -1) {
        objects.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return objects;
}

/** Read just the intent from a model reply, tolerating code fences, reasoning, or prose. */
export function parseIntent(text: string): Intent {
  const candidates = extractJsonObjects(text);
  // Models put the final answer last, so scan from the end for a recognized intent.
  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(candidates[i]!) as { intent?: string };
      if (parsed.intent === "parking_request" || parsed.intent === "suggest_another" || parsed.intent === "other") {
        return parsed.intent;
      }
    } catch {
      continue;
    }
  }
  return "other";
}

/**
 * LLM-backed intent classifier. Destination resolution is deterministic: postal
 * codes short-circuit here, and for other parking requests the place words are
 * extracted deterministically and handed to the (OneMap) geocoder — the model
 * never touches the destination text.
 *
 * The base URL is read from ANTHROPIC_BASE_URL by the SDK. The reply is a plain
 * JSON object (not forced tool use), so this works across Claude and the
 * OpenAI-compatible open models some gateways expose.
 */
export function createAnthropicLlm(apiKey: string, model: string = DEFAULT_MODEL): LlmProvider {
  const client = new Anthropic({ apiKey });

  return {
    async interpret(message: string): Promise<Interpretation> {
      const quick = quickClassify(message);
      if (quick) return quick;

      const response = await client.messages.create({
        model,
        max_tokens: 512, // headroom for models that emit reasoning before the JSON
        messages: [{ role: "user", content: buildClassificationPrompt(message) }],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      const intent = parseIntent(text);
      if (intent === "parking_request") {
        const destinationText = extractDestinationText(message);
        return destinationText ? { intent: "parking_request", destinationText } : { intent: "other" };
      }
      if (intent === "suggest_another") return { intent: "suggest_another" };
      return { intent: "other" };
    },
  };
}
