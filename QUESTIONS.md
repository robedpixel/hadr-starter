# QUESTIONS.md

Scratch file for the `/grill-with-docs` session on the WhatsApp → Singapore car-park agent (see `REQS.md`).

Answer as many as you like per turn. For each, I've given a **Recommendation** — you can just say "accept recommendations except Q4, Q7…" and give your alternatives.

Legend: 🔴 = blocks the design / high-impact · 🟡 = shapes behaviour · 🟢 = detail, safe default exists

---

## ⚠️ Terminology conflict to resolve first

`REQS.md` says: *"a warning if the car park **occupancy** is below a certain threshold and may be taken before I arrive."*

These two halves contradict each other:
- **Occupancy** normally means *how full* a car park is. Low occupancy = lots of empty space = **good**, no warning needed.
- But *"may be taken before I arrive"* is a warning about *running out of free spots* — i.e. **availability** (free lots) getting **low**.

**Q0 🔴 — Which do you actually mean?** I believe you mean: *warn me when the number of free lots is low, because they might all be taken before I get there.*
> **Recommendation:** Adopt the term **Availability** (free lots, or % of capacity free) as the thing measured, and trigger the warning when **Availability is below a threshold**. Reserve "occupancy" only for the inverse if ever needed. (This becomes a `CONTEXT.md` glossary entry.)

---

## A. Telegram bot access (how the agent reads/replies) 🔴

> **DECIDED (supersedes original WhatsApp plan):** The agent is a **Telegram bot** using the official Telegram Bot API (token from BotFather). No ToS/ban risk; the bot only receives messages sent directly to it.

**Q1 🟡 — How does the bot receive updates: long-polling or webhook?**
Long-polling = the bot process calls `getUpdates` in a loop; runs anywhere, no public URL needed. Webhook = Telegram POSTs to a public HTTPS endpoint you host.
> **Recommendation:** **Long-polling.** For a single-user bot running locally, it needs no public URL, no TLS cert, no hosting. Switch to webhook only if you later deploy it to a server.

**Q2 🔴 — "Only used by me": how do we enforce that?**
A Telegram bot is reachable by anyone who finds its handle. Your requirement says it's for you alone.
> **Recommendation:** **Whitelist your Telegram numeric user ID.** The bot ignores (or politely declines) messages from any other user ID. Your ID goes in config/`.env`. This is the enforcement mechanism for "only used by me".

**Q3 🟡 — How is a message recognised as a parking request vs. chatter?**
Treat every message as a request? Require `/park <place>` command? Let the LLM classify intent?
> **Recommendation:** **LLM classifies intent** — free-text "take me to X" works, and a `/start` help command explains usage. No rigid prefix required. (A `/park` command can be an optional convenience.)

**Q4 🟢 — Where does the reply go?**
> **Recommendation:** **Reply in the same Telegram chat** the message came from.

---

## B. Understanding the destination 🔴

**Q5 🔴 — What location formats must it accept?**
Place/POI name ("Marina Bay Sands"), full address, 6-digit SG postal code, mall/building name, landmark?
> **Recommendation:** Accept **POI name, address, and 6-digit postal code**. Resolve all of them to a lat/long via a geocoder.

**Q6 🔴 — Which geocoder resolves the destination?**
Options: **OneMap** (Singapore government's official map API, free, SG-only, very accurate for local addresses/postal codes) vs. Google Maps Geocoding (global, paid beyond free tier).
> **Recommendation:** **OneMap** — it's SG-authoritative, free, and its SG-only nature doubles as your validation (see Q8). Fall back to nothing else for MVP.

**Q7 🟡 — How is the destination extracted from the free-text message?**
> **Recommendation:** **Claude (Anthropic API) extracts** a structured `{destination_text}` from the message, then OneMap geocodes it. LLM handles the messy natural language; the geocoder handles ground truth.

---

## C. Validation & refusal 🔴

**Q8 🔴 — How do we decide a location is "invalid" / outside Singapore?**
> **Recommendation:** A location is **valid** iff **OneMap returns at least one result** for it (OneMap only covers Singapore, so a hit implies in-SG). **Invalid** = no OneMap result, OR the resolved coordinates fall outside SG's bounding box (belt-and-braces). Refuse in both cases.

**Q9 🟡 — What does "refuse" look like, and what about ambiguous (multi-match) locations?**
> **Recommendation:** Refuse with a **clear reason** ("I can only help with destinations in Singapore — I couldn't find 'X' here"). If a query is **ambiguous** (OneMap returns several matches), **ask you to pick** rather than guessing.

**Q10 🟢 — What about non-parking messages (e.g. "hi", "what's the weather")?**
> **Recommendation:** Reply briefly asking for a Singapore destination; take no parking action.

---

## D. Car-park data 🔴

**Q11 🔴 — Which car-park availability data source?**
Options: **data.gov.sg** HDB Carpark Availability (free, open, no key, HDB car parks); **LTA DataMall** Carpark Availability (free API key, covers LTA/HDB/URA — broadest coverage incl. malls/commercial); URA (season parking, less useful here).
> **Recommendation:** **LTA DataMall Carpark Availability** as primary (broadest coverage, incl. commercial car parks near malls/attractions). It returns **available lots + total lots + location**, which gives us both availability and capacity. Add data.gov.sg later if coverage gaps appear.

**Q12 🟡 — RESOLVED — How do we find car parks "near" the destination, and how many do we suggest?**
- Consider only car parks **that have live data** within a **500 m radius** (widen to 1 km if none, and say so).
- The shortlist **includes below-threshold car parks, each with a Low-availability warning**; only **full (0 free lots) car parks are excluded**.
- Ranking: (1) availability ≥ threshold first, then (2) walking distance.
- **NEW affordance — "suggest another":** after a suggestion, the user can ask for an alternative; the agent returns the next-best car park(s) not yet suggested for this request, until it runs out.
- ⚠️ **Open sub-detail (Q12a below):** do we show up to 3 at once, or one at a time?

**Q12a 🟡 — Shortlist size vs. one-at-a-time.** "Suggest another" could mean (a) show up to 3 at once and "another" reveals the next batch, or (b) show the single best and "another" reveals the next one.
> **Recommendation:** **(a) Show up to 3 at once**; "suggest another" reveals the next batch of up to 3 not yet shown. Confirm or switch to (b).

**Q13 🟡 — RESOLVED — Car parks with no data.**
Only car parks **with live data** are ever considered. Car parks without data are **never surfaced**. If **no** car park near the destination has data, tell the user there are no car parks with availability data nearby.

**Q13a 🟡 — All nearby car parks full.** If every nearby car park with data has **0 free lots**, return **"no car parks with free lots available"** (do not suggest a full car park).

---

## E. The warning logic 🔴

**Q14 🔴 — Threshold: absolute free lots or percentage of capacity?**
e.g. "warn if < 20 free lots" vs. "warn if < 15% of the car park is free".
> **Recommendation:** **Percentage of capacity** (e.g. **warn when free lots < 15% of total lots**), with an **absolute floor** (also warn if free lots < 10 regardless of %). Percentage adapts to car-park size; the floor catches nearly-full small lots. Make the numbers config values.

**Q14a 🟡 — ASSUMED (veto welcome): missing total capacity.** LTA DataMall doesn't always report total lots. When total capacity is unavailable for a car park, fall back to the **absolute-lots floor only** (warn if free lots < 10); the percentage rule is skipped for that car park. A car park still counts as "having data" as long as it reports a live free-lots count. Say if you'd rather exclude capacity-less car parks entirely.

**Q15 🔴 — RESOLVED (user):** **No travel-time-aware warning, at all.** The low-availability warning is a **purely static threshold** check against current Availability. ETA / fill-rate / "how fast lots are emptying" logic is **out of scope entirely** (not a v2 item). The "before I arrive" phrasing in `REQS.md` is served only by the static low-availability caution. Recorded as ADR-0005.

---

## F. Shape of the thing (runtime, stack, scope) 🟡

**Q16 🟢 — Runtime model:** confirmed a **long-running local process** doing Telegram long-polling (from Q1). Runs on your machine; single user.
> **Recommendation:** Accept. Restartable; no state needs to persist between runs for MVP.

**Q17 🟡 — Tech stack / framework.**
Now that the Node-only `whatsapp-web.js` constraint is gone, both Node and Python are wide open.
> **Recommendation:** **TypeScript on Node.js**, using **grammY** (modern Telegram bot framework) + the **Anthropic TS SDK** for the LLM parts. Python (`python-telegram-bot` + `anthropic`) is an equally valid alternative if you prefer Python — tell me. (The repo's existing Go/Angular sample is unrelated and won't be reused.)

**Q18 🟢 — Where do secrets live** (Anthropic key, LTA DataMall key)?
> **Recommendation:** A local **`.env`** file, git-ignored. No secrets committed.

**Q19 🟡 — Confirm out-of-scope for v1** (each is a "no" unless you say otherwise):
booking/paying for parking · turn-by-turn navigation · reserving a lot · multi-user support · non-car transport · anything outside Singapore · **travel-time / ETA / fill-rate-aware warnings** (per Q15).
> **ACCEPTED:** All of the above **out of scope** for v1.

---

## Answers log

- **Q0 — RESOLVED:** Term is **Availability** (free lots); warn when it is **low**. Captured in `CONTEXT.md`.
- **PIVOT — DECIDED:** Channel changed from WhatsApp → **Telegram bot** (official Bot API). `REQS.md` + `CONTEXT.md` updated. Section A rewritten; old Q1 (whatsapp mechanism) is moot.
- **Q1 (updates transport) — ACCEPTED rec:** Long-polling (`getUpdates`), no public URL needed. → ADR-0001.
- **Q2 (only-me) — ACCEPTED rec:** Whitelist the user's numeric Telegram user ID; decline all others. → ADR-0001.
- **Q3 (intent) — ACCEPTED rec:** LLM classifies intent; `/start` help; optional `/park`.
- **Q4 (reply) — ACCEPTED rec:** Reply in the same Telegram chat.
- **Q5 (formats) — ACCEPTED rec:** POI name, address, 6-digit postal code.
- **Q6 (geocoder) — ACCEPTED rec:** OneMap. → ADR-0002.
- **Q7 (extraction) — ACCEPTED rec:** Claude extracts destination text; OneMap geocodes.
- **Q8 (validity) — ACCEPTED rec:** Valid iff OneMap returns a result (+ SG bounding-box sanity check); else refuse. → ADR-0002.
- **Q9 (refusal/ambiguity) — ACCEPTED rec:** Clear reason on refusal; ask user to pick when multiple matches.
- **Q10 (chatter) — ACCEPTED rec:** Briefly ask for a Singapore destination; no parking action.
- **Q11 (data source) — ACCEPTED rec:** LTA DataMall Carpark Availability (primary). → ADR-0003.
- **Q12 (near/shortlist) — ACCEPTED rec:** 500 m radius, up to 3 suggestions, ranked by (availability ≥ threshold, then distance); widen to 1 km if none.
- **Q13 (no data) — ACCEPTED rec:** Say so honestly; don't invent a suggestion.
- **Q14 (threshold) — ACCEPTED rec:** % of capacity (< 15% free) with absolute floor (< 10 lots); both configurable.
- **Q15 — RESOLVED (user):** NO travel-time/ETA/fill-rate logic; static threshold only; out of scope entirely. → ADR-0005.
- **Q16 (runtime) — ACCEPTED rec:** Long-running local process (long-polling); single user; no persisted state for MVP.
- **Q17 (stack) — ACCEPTED rec:** TypeScript + Node.js + grammY + Anthropic TS SDK. → ADR-0004.
- **Q18 (secrets) — ACCEPTED rec:** git-ignored `.env`; nothing committed.
- **Q19 (out of scope) — ACCEPTED rec:** booking/payment, navigation, reservation, multi-user, non-car, outside-SG, ETA/fill-rate warnings.

### A2 inconsistency check — resolutions
- **① Car park definition:** Only car parks **with live data** are handled; no-data car parks are never surfaced. Glossary kept tight (no change to intent). ✅
- **② Below-threshold & alternatives:** Suggest below-threshold car parks **with a warning**; exclude full (0-lot) car parks; add **"suggest another"** follow-up affordance (Q12/Q12a). ✅
- **③ Missing capacity — RESOLVED:** Fall back to absolute-lots floor only (< 10) and skip the % rule (Q14a). ✅
- **③b All full:** Return "no car parks with free lots available" (Q13a). ✅
- **Q12a — RESOLVED:** Show up to **3 suggestions at once**; "suggest another" reveals the next batch of up to 3. ✅
- **Q14a — RESOLVED:** Fall back to absolute floor when total capacity is missing. ✅

**STEP A COMPLETE.** All questions resolved; `CONTEXT.md` + `docs/adr/0001–0005.md` finalised. Next: Step B (`/to-prd`), fresh chat, High model.
