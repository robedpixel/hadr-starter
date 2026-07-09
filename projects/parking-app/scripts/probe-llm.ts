// Diagnostic: shows the RAW model reply and the parsed Interpretation for a set
// of messages, using the real provider prompt + parser (src/providers/llm.ts).
// Run from projects/parking-app with your live creds, e.g.:
//   ANTHROPIC_API_KEY=... \
//   ANTHROPIC_BASE_URL=https://opencode.ai/zen/go \
//   ANTHROPIC_MODEL=glm-5.2 \
//   npx tsx scripts/probe-llm.ts
import Anthropic from "@anthropic-ai/sdk";
import { buildClassificationPrompt, extractDestinationText, parseIntent, quickClassify } from "../src/providers/llm.js";

const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
console.log(`baseURL=${client.baseURL}  model=${model}\n`);

const MESSAGES = [
  "I want to go to Jurong Point",
  "heading to Marina Bay Sands",
  "049483",
  "anything else?",
  "hello there",
];

for (const msg of MESSAGES) {
  const quick = quickClassify(msg);
  if (quick) {
    console.log(`"${msg}"\n  quickClassify -> ${JSON.stringify(quick)}\n`);
    continue;
  }
  try {
    const res = await client.messages.create({
      model,
      max_tokens: 512,
      messages: [{ role: "user", content: buildClassificationPrompt(msg) }],
    });
    const raw = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const intent = parseIntent(raw);
    const destination = intent === "parking_request" ? extractDestinationText(msg) : "";
    console.log(`"${msg}"`);
    console.log(`  raw    -> ${JSON.stringify(raw)}`);
    console.log(`  intent -> ${intent}${destination ? `  destination -> ${JSON.stringify(destination)}` : ""}\n`);
  } catch (e: any) {
    console.log(`"${msg}"\n  ERROR -> ${e.status} ${e.error?.error?.message ?? e.message}\n`);
  }
}
