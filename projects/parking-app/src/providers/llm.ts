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
].join("\n");

const TOOL: Anthropic.Tool = {
  name: "record_interpretation",
  description: "Record the interpreted intent of the user's message.",
  input_schema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: ["parking_request", "suggest_another", "other"],
      },
      destinationText: {
        type: "string",
        description: "The place the user named, when intent is parking_request. Omit otherwise.",
      },
    },
    required: ["intent"],
  },
};

/**
 * Anthropic-backed intent classifier + destination extractor.
 *
 * The base URL is read from ANTHROPIC_BASE_URL by the SDK. When pointing at a
 * non-Anthropic gateway, pass the model id that gateway exposes (see config).
 */
export function createAnthropicLlm(apiKey: string, model: string = DEFAULT_MODEL): LlmProvider {
  const client = new Anthropic({ apiKey });

  return {
    async interpret(message: string): Promise<Interpretation> {
      const response = await client.messages.create({
        model,
        max_tokens: 256,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [{ role: "user", content: message }],
      });

      const toolUse = response.content.find((b) => b.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") return { intent: "other" };

      const input = toolUse.input as { intent?: string; destinationText?: string };

      if (input.intent === "parking_request") {
        const text = input.destinationText?.trim();
        return text ? { intent: "parking_request", destinationText: text } : { intent: "other" };
      }
      if (input.intent === "suggest_another") return { intent: "suggest_another" };
      return { intent: "other" };
    },
  };
}
