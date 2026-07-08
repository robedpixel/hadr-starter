# PRD — Singapore Parking Agent (Telegram bot)

> Vocabulary in this PRD follows `CONTEXT.md`. Decisions marked (ADR-N) are recorded in `docs/adr/`.

## Problem Statement

When I decide to drive somewhere in Singapore, I don't know which nearby car park to aim for, or whether it will still have space by the time I arrive. Finding out means checking one or more separate car-park apps or data sources against wherever I'm going — tedious to do every trip, and easy to skip until I'm already circling for a spot. I want to simply say where I'm going and be told a good place to park, with a heads-up when spaces are running low.

## Solution

A personal Telegram bot that only I can use. I message it a destination in plain language ("heading to Marina Bay Sands", "313 Somerset", or a 6-digit postal code). It works out the place — which must be in Singapore — finds nearby Car parks with live Availability, and replies with a short ranked shortlist of up to three Suggestions, each showing how many lots are free and a Low-availability warning where free lots are low. If I don't like the options, I can ask it to suggest another. It refuses politely when the place isn't in Singapore or can't be found, and never acts on messages from anyone but me.

## User Stories

1. As the owner, I want to send the bot a free-text message naming where I'm going, so that I don't have to learn a rigid command syntax.
2. As the owner, I want to give the destination as a point-of-interest name (e.g. "Marina Bay Sands"), so that I can use the names I actually think in.
3. As the owner, I want to give the destination as a street address, so that I can park near a specific building.
4. As the owner, I want to give the destination as a 6-digit Singapore postal code, so that I can be precise when I know it.
5. As the owner, I want the bot to reply in the same Telegram chat I messaged, so that the conversation stays in one place.
6. As the owner, I want a `/start` (help) message explaining what the bot does and how to ask, so that I remember how to use it after a break.
7. As the owner, I want the bot to understand ordinary phrasing like "I want to go to X" or "parking near Y", so that I can talk to it naturally.
8. As the owner, I want the bot to recognise when my message isn't a Parking request and ask me for a Singapore destination, so that idle chatter doesn't produce nonsense.
9. As the owner, I want up to three Car park Suggestions near my Destination, so that I have options without being overwhelmed.
10. As the owner, I want each Suggestion to show the Car park's name and how many lots are currently free, so that I can judge it at a glance.
11. As the owner, I want each Suggestion to show how far the Car park is from my Destination, so that I can weigh walking distance.
12. As the owner, I want Suggestions ranked with car parks that are above the Availability threshold first, then by distance, so that the best realistic option is at the top.
13. As the owner, I want a Low-availability warning on any Suggestion whose free lots are below the Availability threshold, so that I know spaces might be taken before I arrive.
14. As the owner, I want Car parks that are Full (zero free lots) left out of Suggestions, so that I'm never sent somewhere with no space.
15. As the owner, I want below-threshold (but not Full) Car parks still offered with a warning, so that I still get an option when everywhere is busy.
16. As the owner, I want to ask the bot to "suggest another" and get the next-best Car parks it hasn't already offered for this Destination, so that I can look past the first options.
17. As the owner, I want the bot to tell me plainly when it has run out of further Car parks to suggest, so that I'm not left waiting.
18. As the owner, I want the bot to search within 500 m of my Destination and widen to 1 km only if nothing is found (telling me it did so), so that Suggestions are genuinely close by default.
19. As the owner, I want to be told when there are no Car parks with live data near my Destination, so that I understand the absence of Suggestions.
20. As the owner, I want to be told "no car parks with free lots available" when every nearby Car park is Full, so that I know the situation rather than being sent to a full lot.
21. As the owner, I want the bot to refuse when my Destination is outside Singapore, stating that reason, so that I'm not given bad or foreign results.
22. As the owner, I want the bot to refuse when it can't find my Destination at all, stating it couldn't find the place, so that I know to rephrase.
23. As the owner, I want the bot to ask me to choose when my Destination is ambiguous (several matches), so that it doesn't silently pick the wrong one.
24. As the owner, I want the bot to respond only to me and ignore/decline anyone else who messages it, so that "only used by me" is enforced.
25. As the owner, I want the bot to use current live Availability at the moment I ask, so that Suggestions reflect reality rather than stale data.
26. As the owner, I want to be able to adjust the Availability threshold values (percentage and absolute floor) in configuration, so that "low" matches my own tolerance.
27. As the owner, if the bot restarts mid-conversation and forgets context, I want to simply re-send my Destination, so that a restart is a minor inconvenience rather than a failure.
28. As the owner, I want my Telegram, car-park, and AI credentials kept out of the codebase, so that nothing sensitive is committed.

## Implementation Decisions

**Channel & transport**
- The agent is a **Telegram bot** on the official Bot API, using **grammY** on **TypeScript/Node.js** (ADR-0001, ADR-0004).
- Updates are received by **long-polling** (`getUpdates`); no public URL, webhook, or hosting required (ADR-0001).
- **Single-user enforcement:** the bot compares the sender's numeric Telegram user ID against a configured owner ID and declines all others. This is the sole access control (ADR-0001).

**Natural-language understanding**
- **Claude (Anthropic TS SDK)** performs two jobs: (a) classify whether an incoming message is a Parking request, and (b) extract the destination text from it. The raw extracted text is then handed to the geocoder — the LLM does not decide validity or coordinates.

**Destination resolution & validation**
- **OneMap** resolves POI names, addresses, and 6-digit postal codes to coordinates (ADR-0002).
- A Destination is **valid iff OneMap returns at least one result**, with a Singapore bounding-box check on the coordinates as a secondary sanity check; otherwise the request is refused as invalid/out-of-Singapore (ADR-0002).
- **Ambiguous** queries (multiple OneMap matches) are returned to the owner to disambiguate rather than guessed (ADR-0002).

**Car-park data & Suggestion logic**
- Live Availability comes from **LTA DataMall Carpark Availability** (ADR-0003).
- Only Car parks **with live data** are ever considered; facilities without data are never surfaced.
- Candidate Car parks are those within **500 m** of the Destination; if none, the radius widens to **1 km** and the reply says so.
- **Full** (zero free lots) Car parks are excluded. Below-threshold but non-Full Car parks are included, each carrying a Low-availability warning.
- Ranking: Car parks with Availability **≥ threshold first**, then by ascending distance to the Destination. The top **3** form the Suggestion.
- If no candidate has data → "no car parks with availability data nearby". If all candidates are Full → "no car parks with free lots available".

**Availability threshold**
- "Low" = free lots **< 15% of total capacity**, OR free lots **< 10** (absolute floor), whichever triggers.
- When a Car park reports free lots but **no total capacity**, the percentage rule is skipped and only the absolute floor applies. A Car park counts as "having data" as long as it reports a live free-lots count.
- The percentage and floor are **configuration values**.

**Suggest-another & conversation state**
- The bot keeps **in-memory, per-chat** conversation state: the current Destination and the set of Car parks already offered for it. A Suggest-another request returns the next batch of up to 3 not-yet-offered candidates, until exhausted.
- This state is **not persisted across process restarts** (by design). After a restart, the owner re-sends the Destination.

**Warning semantics**
- The Low-availability warning is a **static check against current Availability only**; it does not model travel time, ETA, or fill rate (ADR-0005).

**Modules / seams (interfaces, not file paths)**
- **Transport adapter** — grammY bot; receives updates, applies the owner whitelist, calls the core, sends replies. Thin; no business logic.
- **Core message handler** — `handleMessage(input, conversationState, providers) → { reply, newState }`. Pure orchestration: intent → resolve → fetch → filter/rank/warn → format → next state. Depends only on injected provider **interfaces**.
- **Provider interfaces** — `LlmProvider` (classify/extract), `Geocoder` (resolve + validity), `CarparkProvider` (availability near a point). Real implementations wrap Anthropic, OneMap, and LTA DataMall respectively.
- **Config** — owner Telegram ID, threshold values, radii, and secrets loaded from a git-ignored `.env` (ADR-0004).

## Testing Decisions

- **What makes a good test here:** it asserts **external behaviour** — given an inbound message (and, for follow-ups, a prior conversation state) plus fixed provider responses, the resulting reply and new state are correct. Tests must not assert on internal call sequences, prompt strings, or private helpers.
- **Primary seam (one):** the **core message handler** with the three provider interfaces **faked**. This is the highest seam that still exercises all decision logic (intent handling, validation, filtering, ranking, warnings, Suggest-another, refusals) deterministically — the LLM and network are removed by injecting fakes.
- **Modules tested:** the core message handler (behavioural suite). The transport adapter and the real provider clients are **thin adapters** verified by light/manual integration (e.g. a real message to the bot during development), not unit tests — deliberately keeping the seam count at one.
- **Behavioural scenarios the suite must cover:**
  1. Valid Destination, candidates above threshold → up to 3 ranked Suggestions, no warnings.
  2. Candidates below threshold (not Full) → Suggestions carry Low-availability warnings.
  3. Mixed → above-threshold ranked first, warnings only on the low ones.
  4. All candidates Full → "no car parks with free lots available".
  5. No candidate with data → "no car parks with availability data nearby".
  6. None within 500 m but some within 1 km → widened search, reply notes it.
  7. Destination outside Singapore → refusal stating the reason.
  8. Destination not found by OneMap → refusal stating it couldn't find the place.
  9. Ambiguous Destination → disambiguation prompt, no Suggestion yet.
  10. Non-Parking-request message → asks for a Singapore destination.
  11. Suggest-another → returns the next unseen batch; then reports exhaustion.
  12. Message from a non-owner user ID → declined/ignored.
  13. Car park with free-lots but missing total capacity → absolute-floor rule applied for its warning.
- **Prior art:** none in this repo — the existing `crud-example` (Go/Angular) is unrelated. This is the first test suite for the agent; establish it with a standard Node test runner (recommend **Vitest**) and simple hand-written fakes for the three providers.

## Out of Scope

- Booking, paying for, or reserving a parking lot.
- Turn-by-turn navigation or routing to the Car park.
- Any location or Car park outside Singapore.
- Multi-user support or accounts beyond the single owner whitelist.
- Non-car transport modes.
- **Travel-time / ETA / fill-rate-aware warnings** — the warning is static (ADR-0005).
- Persistence of conversation state across process restarts; any database.
- Webhook-based deployment and public hosting (long-polling local process only for v1).
- Proactive/scheduled alerts (the bot only responds to a message).
- data.gov.sg or URA as data sources (LTA DataMall only for v1; may be added later if coverage gaps appear).

## Further Notes

- **Credentials required** in `.env`: Telegram Bot token (from BotFather), LTA DataMall API key, Anthropic API key. OneMap's search/geocoding endpoint is publicly callable; note its rate limits (some other OneMap endpoints require a registered token — not needed for search-based geocoding in v1).
- **Suggested project location:** a new `projects/parking-agent/` TypeScript package; the repo's `crud-example` is untouched and unreused.
- **grammY session state:** the in-memory per-chat conversation state can be held via grammY's session middleware (in-memory storage), consistent with the "no persistence" decision.
- **Rate limits / cost:** each request makes at most one Anthropic call, one OneMap call, and one LTA DataMall call; live-only, no caching in v1.
- **Publishing:** this PRD is written to `docs/PRD.md`. The `/to-prd` skill can also publish to a GitHub issue tracker with a `ready-for-agent` label, but no issue tracker/label vocabulary is configured in this repo (would require `/setup-matt-pocock-skills`). Say the word if you want that set up.
