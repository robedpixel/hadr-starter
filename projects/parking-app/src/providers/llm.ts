import Anthropic from "@anthropic-ai/sdk";
import type { Interpretation, LlmProvider } from "../domain/types.js";

const DEFAULT_MODEL = "claude-opus-4-8";

const SYSTEM = [
  "You interpret short chat messages sent to a personal Singapore parking bot.",
  "Classify each message into exactly one intent and, when it is a parking request,",
  "extract the raw destination text the user named. You do NOT judge whether the",
  "place is real, valid, or in Singapore — a geocoder handles that. Just pull out",
  "the words that name where they want to go.",
  "",
  "Intents:",
  "- parking_request: the user is telling you where they want to drive/park",
  '  (e.g. "heading to Marina Bay Sands", "313 Somerset", "parking near 049483",',
  '  "I want to go to the airport"). Set destinationText to the place words only,',
  "  stripped of filler like \"take me to\" / \"parking near\".",
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

/** Pull the first JSON object out of a model reply, tolerating fences or stray prose. */
function extractInterpretation(text: string): Interpretation {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return { intent: "other" };

  let parsed: { intent?: string; destinationText?: string };
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { intent: "other" };
  }

  if (parsed.intent === "parking_request") {
    const destinationText = parsed.destinationText?.trim();
    return destinationText ? { intent: "parking_request", destinationText } : { intent: "other" };
  }
  if (parsed.intent === "suggest_another") return { intent: "suggest_another" };
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

      return extractInterpretation(text);
    },
  };
}
