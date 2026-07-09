# Parking App — Singapore Parking Agent (Telegram bot)

A personal, single-user Telegram bot: message it a Singapore destination in plain
language and it replies with up to three nearby car parks, showing free lots and
distance, with a warning where availability is running low. Implements the design
in [`docs/PRD.md`](../../docs/PRD.md); vocabulary follows [`CONTEXT.md`](../../CONTEXT.md);
decisions are in [`docs/adr/`](../../docs/adr/).

## What this slice delivers

A **runnable end-to-end bot**:

- **Core message handler** (`src/core/handleMessage.ts`) — the one behavioural
  seam. Pure orchestration over injected provider interfaces: owner check →
  intent → resolve → fetch → filter/rank/warn → format → next state.
- **Behavioural test suite** (`src/core/handleMessage.test.ts`) — all 13 PRD
  scenarios, with hand-written fakes for the three providers. No network, no
  credentials. **This is the guarantee of correctness.**
- **Real providers** — Anthropic (intent + destination extraction via forced
  tool use), OneMap (geocoding + Singapore validity), LTA DataMall (live
  availability).
- **grammY transport + entry point** — long-polling, owner whitelist, in-memory
  per-chat state.

## Architecture

```
Telegram ──► transport/bot.ts ──► core/handleMessage.ts ──► providers (interfaces)
              (thin adapter)        (all decision logic)      ├─ LlmProvider   → Anthropic
                                                              ├─ Geocoder      → OneMap
                                                              └─ CarparkProvider → LTA DataMall
```

The core depends only on the interfaces in `src/domain/types.ts`. The tests
inject fakes; production injects the real clients (`src/providers/*`).

## Setup

```bash
npm install
cp .env.example .env   # then fill in the four credentials
```

Credentials (all git-ignored, see `.env.example`):

- `TELEGRAM_BOT_TOKEN` — from [@BotFather](https://t.me/BotFather)
- `OWNER_TELEGRAM_ID` — your numeric Telegram user ID (from @userinfobot); the
  **only** user the bot answers
- `ANTHROPIC_API_KEY`
- `LTA_ACCOUNT_KEY` — free [LTA DataMall](https://datamall.lta.gov.sg/) key

Optional Anthropic overrides (leave blank for the defaults):

- `ANTHROPIC_BASE_URL` — point the LLM client at an Anthropic-API-compatible
  endpoint (proxy, gateway, or self-hosted shim). Read by the SDK from the
  environment. Blank uses the default Anthropic API.
- `ANTHROPIC_MODEL` — override the model id (default `claude-opus-4-8`). Set
  this to a model your gateway exposes when you point `ANTHROPIC_BASE_URL` at
  one that doesn't serve the default.

Optional tuning: `LOW_AVAILABILITY_PERCENT` (default `0.15`),
`LOW_AVAILABILITY_FLOOR` (default `10`).

## Run

```bash
npm start          # long-polling bot; no public URL needed
npm test           # behavioural suite (offline)
npm run typecheck
```

Then message your bot on Telegram: `heading to Marina Bay Sands`, `313 Somerset`,
or a 6-digit postal code. Ask for `something else` to page through more options.

## Out of scope for this slice

Booking/paying, routing/ETA, non-SG locations, multi-user, persistence across
restarts, webhooks, and proactive alerts — all per the PRD's Out of Scope
section. The real provider clients are thin adapters verified by manual
integration (send the bot a real message), not by unit tests — the single tested
seam is the core handler.
