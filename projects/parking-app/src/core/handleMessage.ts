import {
  type Carpark,
  type Config,
  type ConversationState,
  type Destination,
  type Providers,
  type Suggestion,
} from "../domain/types.js";
import { haversineMeters } from "./geo.js";

export interface HandleInput {
  text: string;
  fromUserId: number;
}

export interface HandleResult {
  /** Text to send back, or null to stay silent (e.g. a non-owner message). */
  reply: string | null;
  newState: ConversationState;
}

/**
 * The one behavioural seam. Pure orchestration over injected providers:
 * owner check → intent → resolve → fetch → filter/rank/warn → format → next state.
 */
export async function handleMessage(
  input: HandleInput,
  state: ConversationState,
  providers: Providers,
  config: Config,
): Promise<HandleResult> {
  // Single-user enforcement (ADR-0001): ignore everyone but the owner.
  if (input.fromUserId !== config.ownerTelegramId) {
    return { reply: null, newState: state };
  }

  const interpretation = await providers.llm.interpret(input.text);

  if (interpretation.intent === "other") {
    return { reply: MSG.askForDestination, newState: state };
  }

  if (interpretation.intent === "suggest_another") {
    return suggestAnother(state, providers, config);
  }

  return newParkingRequest(interpretation.destinationText, providers, config);
}

async function newParkingRequest(
  destinationText: string,
  providers: Providers,
  config: Config,
): Promise<HandleResult> {
  const geo = await providers.geocoder.resolve(destinationText);

  switch (geo.status) {
    case "not_found":
      return { reply: MSG.notFound, newState: { destination: null, offeredCarparkIds: [] } };
    case "outside_singapore":
      return { reply: MSG.outsideSingapore, newState: { destination: null, offeredCarparkIds: [] } };
    case "ambiguous":
      // Don't guess — ask the owner to pick. No Destination is committed.
      return { reply: formatDisambiguation(geo.options), newState: { destination: null, offeredCarparkIds: [] } };
    case "resolved":
      break;
  }

  const destination = geo.destination;
  const carparks = await providers.carparks.availabilityNear(destination.coordinates);
  const { candidates, widened } = selectCandidates(destination, carparks, config);

  if (candidates.length === 0) {
    return { reply: MSG.noDataNearby, newState: { destination, offeredCarparkIds: [] } };
  }

  const ranked = rank(candidates, config);
  if (ranked.length === 0) {
    return { reply: MSG.allFull, newState: { destination, offeredCarparkIds: [] } };
  }

  const batch = ranked.slice(0, config.maxSuggestions);
  return {
    reply: formatSuggestions(destination, batch, { widened, more: false }),
    newState: { destination, offeredCarparkIds: batch.map((s) => s.carpark.id) },
  };
}

async function suggestAnother(
  state: ConversationState,
  providers: Providers,
  config: Config,
): Promise<HandleResult> {
  if (!state.destination) {
    // Likely a restart wiped context (PRD story 27) — ask for the Destination.
    return { reply: MSG.noDestinationYet, newState: state };
  }

  const destination = state.destination;
  const carparks = await providers.carparks.availabilityNear(destination.coordinates);
  const { candidates } = selectCandidates(destination, carparks, config);
  const ranked = rank(candidates, config);

  const alreadyOffered = new Set(state.offeredCarparkIds);
  const remaining = ranked.filter((s) => !alreadyOffered.has(s.carpark.id));
  const batch = remaining.slice(0, config.maxSuggestions);

  if (batch.length === 0) {
    return { reply: MSG.exhausted(destination.name), newState: state };
  }

  return {
    reply: formatSuggestions(destination, batch, { widened: false, more: true }),
    newState: {
      destination,
      offeredCarparkIds: [...state.offeredCarparkIds, ...batch.map((s) => s.carpark.id)],
    },
  };
}

// --- Filtering / ranking / warnings ---

interface Candidate {
  carpark: Carpark;
  distanceMeters: number;
}

/**
 * Car parks within the primary radius; widen to the fallback radius only if the
 * primary radius yields nothing (PRD: 500 m, then 1 km).
 */
function selectCandidates(
  destination: Destination,
  carparks: Carpark[],
  config: Config,
): { candidates: Candidate[]; widened: boolean } {
  const withDistance = carparks
    .map((carpark) => ({ carpark, distanceMeters: haversineMeters(destination.coordinates, carpark.coordinates) }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  const primary = withDistance.filter((c) => c.distanceMeters <= config.primaryRadiusMeters);
  if (primary.length > 0) return { candidates: primary, widened: false };

  const widened = withDistance.filter((c) => c.distanceMeters <= config.widenedRadiusMeters);
  if (widened.length > 0) return { candidates: widened, widened: true };

  return { candidates: [], widened: false };
}

/** Free lots below the percentage-of-capacity rule OR the absolute floor. */
export function isLowAvailability(carpark: Carpark, config: Config): boolean {
  if (carpark.freeLots < config.lowAvailabilityFloor) return true;
  if (carpark.totalLots && carpark.totalLots > 0) {
    return carpark.freeLots < config.lowAvailabilityPercent * carpark.totalLots;
  }
  return false; // No capacity → percentage rule skipped; floor already checked.
}

/**
 * Exclude Full Car parks; rank above-threshold first, then by ascending
 * distance (PRD user story 12). Below-threshold Car parks stay in, carrying a
 * Low-availability warning.
 */
function rank(candidates: Candidate[], config: Config): Suggestion[] {
  return candidates
    .filter((c) => c.carpark.freeLots > 0) // drop Full
    .map((c) => ({
      carpark: c.carpark,
      distanceMeters: c.distanceMeters,
      lowAvailability: isLowAvailability(c.carpark, config),
    }))
    .sort((a, b) => {
      if (a.lowAvailability !== b.lowAvailability) return a.lowAvailability ? 1 : -1;
      return a.distanceMeters - b.distanceMeters;
    });
}

// --- Formatting ---

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatSuggestions(
  destination: Destination,
  batch: Suggestion[],
  opts: { widened: boolean; more: boolean },
): string {
  const header = opts.more
    ? `Here are more car parks near ${destination.name}:`
    : opts.widened
      ? `No car parks within 500 m of ${destination.name}, so I widened the search to 1 km. Closest options:`
      : `Car parks near ${destination.name}:`;

  const lines = batch.map((s, i) => {
    const base = `${i + 1}. ${s.carpark.name} — ${s.carpark.freeLots} lots free, ${formatDistance(s.distanceMeters)} away`;
    return s.lowAvailability
      ? `${base}\n   ⚠️ Low availability — spaces may be taken before you arrive.`
      : base;
  });

  return [header, "", ...lines].join("\n");
}

function formatDisambiguation(options: Destination[]): string {
  const lines = options.map((o) => `• ${o.name}`);
  return [
    "I found more than one place matching that. Which did you mean?",
    ...lines,
    "",
    "Reply with a more specific name, address, or 6-digit postal code.",
  ].join("\n");
}

const MSG = {
  askForDestination:
    "I can only help you find parking in Singapore. Tell me where you're heading — a place name, address, or 6-digit postal code.",
  noDestinationYet:
    "I don't have a destination yet. Tell me where you're heading in Singapore and I'll suggest car parks.",
  notFound:
    "I couldn't find that place. Try rephrasing, or give me an address or 6-digit postal code.",
  outsideSingapore:
    "That destination is outside Singapore, so I can't suggest car parks for it.",
  noDataNearby: "There are no car parks with availability data nearby.",
  allFull: "There are no car parks with free lots available nearby right now.",
  exhausted: (name: string) => `That's all the car parks I could find near ${name}.`,
} as const;
