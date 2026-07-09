import Anthropic from "@anthropic-ai/sdk";
import type { Interpretation, LlmProvider } from "../domain/types.js";

const DEFAULT_MODEL = "claude-opus-4-8";

export const SYSTEM = [
  "You interpret short chat messages sent to a personal Singapore parking bot.",
  "Classify each message into exactly one intent and, when it is a parking request,",
  "extract the raw destination text the user named. You do NOT judge whether the",
  "place is real, valid, or in Singapore — a geocoder handles that. Just pull out",
  "the words that name where they want to go.",
  "",
  "Intents:",
  "- parking_request: the user is telling you where they want to drive/park",
  '  (e.g. "heading to Marina Bay Sands", "313 Somerset", "parking near 049483",',
  '  "I want to go to the airport"). A message that is ONLY a place name, an',
  '  address, or a bare 6-digit postal code (e.g. "049483") is still a',
  "  parking_request — the user is naming a destination. Set destinationText to the",
  '  place words only, stripped of filler like "take me to" / "parking near". For a',
  "  bare place name / address / postal code, destinationText is the whole message.",
  '- suggest_another: the user is asking for different/more options for the place',
  '  already under discussion (e.g. "anything else?", "suggest another", "what else",',
  '  "somewhere closer"). No destinationText.',
  "- other: greetings, chit-chat, or anything that is not a destination or a",
  "  request for more options.",
  "",
  "Reply with ONLY a single JSON object and nothing else — no explanation and no",
  "markdown code fences. Use exactly this shape:",
  '  {"intent": "parking_request", "destinationText": "<the place words>"}',
  '  {"intent": "suggest_another"}',
  '  {"intent": "other"}',
  'Include the "destinationText" field only when intent is "parking_request".',
].join("\n");

/**
 * Deterministic short-circuit for inputs we can classify without the model.
 * A bare 6-digit string is always a Singapore postal code (the geocoder still
 * validates it), so we never let a weaker model misread it as chit-chat.
 * Returns null when the message needs the model to interpret it.
 */
export function quickClassify(message: string): Interpretation | null {
  const trimmed = message.trim();
  if (/^\d{6}$/.test(trimmed)) {
    return { intent: "parking_request", destinationText: trimmed };
  }
  return null;
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

/** Interpret a model reply, tolerating code fences, reasoning, or stray prose. */
export function parseInterpretation(text: string): Interpretation {
  const candidates = extractJsonObjects(text);

  // Models put the final answer last, so scan from the end for the first object
  // that carries a recognized intent.
  for (let i = candidates.length - 1; i >= 0; i--) {
    let parsed: { intent?: string; destinationText?: string };
    try {
      parsed = JSON.parse(candidates[i]!);
    } catch {
      continue;
    }

    if (parsed.intent === "parking_request") {
      const destinationText = parsed.destinationText?.trim();
      if (destinationText) return { intent: "parking_request", destinationText };
      continue; // parking_request with no destination — keep looking
    }
    if (parsed.intent === "suggest_another") return { intent: "suggest_another" };
    if (parsed.intent === "other") return { intent: "other" };
  }
  return { intent: "other" };
}

/**
 * LLM-backed intent classifier + destination extractor.
 *
 * The base URL is read from ANTHROPIC_BASE_URL by the SDK. Rather than forced
 * Anthropic tool use (which non-Anthropic gateways translate unreliably), this
 * asks for a plain JSON object and parses it, so it works across Claude and the
 * OpenAI-compatible open models some gateways expose. When pointing at such a
 * gateway, pass the model id that gateway exposes (see config).
 */
export function createAnthropicLlm(apiKey: string, model: string = DEFAULT_MODEL): LlmProvider {
  const client = new Anthropic({ apiKey });

  return {
    async interpret(message: string): Promise<Interpretation> {
      const quick = quickClassify(message);
      if (quick) return quick;

      const response = await client.messages.create({
        model,
        max_tokens: 256,
        system: SYSTEM,
        messages: [{ role: "user", content: message }],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      return parseInterpretation(text);
    },
  };
}
