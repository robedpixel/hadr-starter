// Diagnostic: verify the LLM provider works against your configured gateway/model.
// Mirrors src/providers/llm.ts (plain JSON reply, no forced tool use).
// Run from projects/parking-app with your live creds in the env, e.g.:
//   ANTHROPIC_API_KEY=... \
//   ANTHROPIC_BASE_URL=https://opencode.ai/zen/go \
//   ANTHROPIC_MODEL=glm-5.2 \
//   node scripts/probe-llm.mjs
import Anthropic from "@anthropic-ai/sdk";

const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
console.log(`baseURL=${client.baseURL}  model=${model}\n`);

const SYSTEM = [
  "You interpret short chat messages sent to a personal Singapore parking bot.",
  "Classify the message and, for a parking request, extract the raw place text.",
  "",
  "Reply with ONLY a single JSON object and nothing else — no fences, no prose:",
  '  {"intent": "parking_request", "destinationText": "<the place words>"}',
  '  {"intent": "suggest_another"}',
  '  {"intent": "other"}',
].join("\n");

for (const msg of ["heading to Marina Bay Sands", "anything else?", "hello there"]) {
  try {
    const res = await client.messages.create({
      model,
      max_tokens: 256,
      system: SYSTEM,
      messages: [{ role: "user", content: msg }],
    });
    const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    console.log(`✅ "${msg}" -> ${text.replace(/\s+/g, " ").trim()}`);
  } catch (e) {
    console.log(`❌ "${msg}" -> ${e.status} ${e.error?.error?.message ?? e.message}`);
  }
}
