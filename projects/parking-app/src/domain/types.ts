// Domain vocabulary follows CONTEXT.md. Interfaces here are the seams the PRD
// describes: the core message handler depends only on these, never on the real
// Anthropic / OneMap / LTA clients.

export interface Coordinates {
  lat: number;
  lng: number;
}

/** The single Singapore place the owner wants to drive to, resolved to coordinates. */
export interface Destination {
  /** Human-readable name as resolved (e.g. "MARINA BAY SANDS"). */
  name: string;
  coordinates: Coordinates;
}

/**
 * A parking facility for which we have live Availability data. Facilities
 * without live data are never represented here (out of scope per CONTEXT.md).
 */
export interface Carpark {
  id: string;
  name: string;
  coordinates: Coordinates;
  /** Free (unoccupied) lots right now. This is our Availability measure. */
  freeLots: number;
  /**
   * Total capacity, if the source reports it. LTA DataMall's availability feed
   * often omits it — when absent the percentage rule is skipped and only the
   * absolute-lots floor applies (PRD: Availability threshold).
   */
  totalLots?: number;
}

/** One entry in a Suggestion: a non-Full Car park with distance and a warning flag. */
export interface Suggestion {
  carpark: Carpark;
  distanceMeters: number;
  /** True when this Car park is below the Availability threshold. */
  lowAvailability: boolean;
}

/**
 * In-memory, per-chat conversation state. Not persisted across restarts (by
 * design) — after a restart the owner re-sends the Destination.
 */
export interface ConversationState {
  destination: Destination | null;
  /** IDs of Car parks already offered for the current Destination. */
  offeredCarparkIds: string[];
}

export function emptyState(): ConversationState {
  return { destination: null, offeredCarparkIds: [] };
}

export interface Config {
  /** The one Telegram user ID the bot answers to. */
  ownerTelegramId: number;
  /** Free lots below this fraction of capacity counts as low. */
  lowAvailabilityPercent: number;
  /** Free lots below this absolute count is low, regardless of capacity. */
  lowAvailabilityFloor: number;
  /** Preferred search radius. */
  primaryRadiusMeters: number;
  /** Fallback radius when nothing is found within the primary radius. */
  widenedRadiusMeters: number;
  /** Maximum Car parks per Suggestion. */
  maxSuggestions: number;
}

export const DEFAULT_TUNING = {
  lowAvailabilityPercent: 0.15,
  lowAvailabilityFloor: 10,
  primaryRadiusMeters: 500,
  widenedRadiusMeters: 1000,
  maxSuggestions: 3,
} as const;

// --- Provider interfaces (the three seams) ---

/**
 * What the LLM extracts from an inbound message. All natural-language
 * understanding lives behind this interface; the core acts on the verdict only.
 */
export type Interpretation =
  | { intent: "parking_request"; destinationText: string }
  | { intent: "suggest_another" }
  | { intent: "other" };

export interface LlmProvider {
  interpret(message: string): Promise<Interpretation>;
}

/**
 * Resolution + Singapore-validity in one call (OneMap doubles as the SG
 * validator per ADR-0002).
 */
export type GeocodeResult =
  | { status: "resolved"; destination: Destination }
  | { status: "ambiguous"; options: Destination[] }
  | { status: "not_found" }
  | { status: "outside_singapore" };

export interface Geocoder {
  resolve(query: string): Promise<GeocodeResult>;
}

export interface CarparkProvider {
  /**
   * Car parks with live Availability near a point. Implementations may return
   * a superset (e.g. everything with live data); the core filters by distance.
   */
  availabilityNear(point: Coordinates): Promise<Carpark[]>;
}

export interface Providers {
  llm: LlmProvider;
  geocoder: Geocoder;
  carparks: CarparkProvider;
}
