import { describe, expect, it } from "vitest";
import { handleMessage } from "./handleMessage.js";
import {
  DEFAULT_TUNING,
  emptyState,
  type Carpark,
  type Config,
  type ConversationState,
  type Coordinates,
  type GeocodeResult,
  type Interpretation,
  type LlmProvider,
  type CarparkProvider,
  type Geocoder,
  type Providers,
} from "../domain/types.js";

// --- Fixtures -------------------------------------------------------------

const OWNER = 42;

const config: Config = { ownerTelegramId: OWNER, ...DEFAULT_TUNING };

// Marina Bay Sands, roughly. ~0.001 deg ≈ 111 m near the equator.
const MBS: Coordinates = { lat: 1.2834, lng: 103.8607 };
const at = (metresEast: number): Coordinates => ({
  lat: MBS.lat,
  lng: MBS.lng + metresEast / 111_000,
});

const cp = (id: string, metresEast: number, freeLots: number, totalLots?: number): Carpark => ({
  id,
  name: `Car Park ${id}`,
  coordinates: at(metresEast),
  freeLots,
  ...(totalLots === undefined ? {} : { totalLots }),
});

// --- Fakes ----------------------------------------------------------------

const fakeLlm = (interpretation: Interpretation): LlmProvider => ({
  interpret: async () => interpretation,
});
const fakeGeocoder = (result: GeocodeResult): Geocoder => ({
  resolve: async () => result,
});
const fakeCarparks = (carparks: Carpark[]): CarparkProvider => ({
  availabilityNear: async () => carparks,
});

const resolvedMBS: GeocodeResult = {
  status: "resolved",
  destination: { name: "MARINA BAY SANDS", coordinates: MBS },
};

const providers = (p: Partial<Providers>): Providers => ({
  llm: p.llm ?? fakeLlm({ intent: "other" }),
  geocoder: p.geocoder ?? fakeGeocoder({ status: "not_found" }),
  carparks: p.carparks ?? fakeCarparks([]),
});

const parkingRequest = (destinationText = "Marina Bay Sands"): LlmProvider =>
  fakeLlm({ intent: "parking_request", destinationText });

const owner = (text = "heading to Marina Bay Sands") => ({ text, fromUserId: OWNER });

// --- Scenarios ------------------------------------------------------------

describe("handleMessage", () => {
  it("1. valid destination, all above threshold → up to 3 ranked, no warnings", async () => {
    const carparks = [cp("A", 111, 200, 300), cp("B", 222, 500, 800), cp("C", 445, 150, 400)];
    const { reply, newState } = await handleMessage(
      owner(),
      emptyState(),
      providers({ llm: parkingRequest(), geocoder: fakeGeocoder(resolvedMBS), carparks: fakeCarparks(carparks) }),
      config,
    );

    expect(reply).not.toBeNull();
    expect(reply).not.toMatch(/low availability/i);
    // Ranked by distance: A, B, C.
    expect(reply!.indexOf("Car Park A")).toBeLessThan(reply!.indexOf("Car Park B"));
    expect(reply!.indexOf("Car Park B")).toBeLessThan(reply!.indexOf("Car Park C"));
    expect(reply).toContain("200 lots free");
    expect(newState.destination?.name).toBe("MARINA BAY SANDS");
    expect(newState.offeredCarparkIds).toEqual(["A", "B", "C"]);
  });

  it("2. below threshold (not Full) → Suggestions carry Low-availability warnings", async () => {
    const carparks = [cp("A", 111, 5, 300), cp("B", 222, 8, 300)];
    const { reply } = await handleMessage(
      owner(),
      emptyState(),
      providers({ llm: parkingRequest(), geocoder: fakeGeocoder(resolvedMBS), carparks: fakeCarparks(carparks) }),
      config,
    );
    expect(reply).toMatch(/low availability/i);
    expect(reply).toContain("Car Park A");
    expect(reply).toContain("Car Park B");
  });

  it("3. mixed → above-threshold ranked first, warnings only on the low one", async () => {
    // A is nearest but low; B and C are farther but above threshold.
    const carparks = [cp("A", 111, 5, 300), cp("B", 222, 200, 300), cp("C", 445, 300, 400)];
    const { reply } = await handleMessage(
      owner(),
      emptyState(),
      providers({ llm: parkingRequest(), geocoder: fakeGeocoder(resolvedMBS), carparks: fakeCarparks(carparks) }),
      config,
    );
    // Above-threshold B/C precede the low A despite A being closer.
    expect(reply!.indexOf("Car Park B")).toBeLessThan(reply!.indexOf("Car Park A"));
    expect(reply!.indexOf("Car Park C")).toBeLessThan(reply!.indexOf("Car Park A"));
    // Exactly one warning (for A).
    expect(reply!.match(/low availability/gi)).toHaveLength(1);
  });

  it("4. all candidates Full → 'no car parks with free lots available'", async () => {
    const carparks = [cp("A", 111, 0, 300), cp("B", 222, 0, 300)];
    const { reply } = await handleMessage(
      owner(),
      emptyState(),
      providers({ llm: parkingRequest(), geocoder: fakeGeocoder(resolvedMBS), carparks: fakeCarparks(carparks) }),
      config,
    );
    expect(reply).toMatch(/no car parks with free lots available/i);
  });

  it("5. no candidate with data → 'no car parks with availability data nearby'", async () => {
    const { reply } = await handleMessage(
      owner(),
      emptyState(),
      providers({ llm: parkingRequest(), geocoder: fakeGeocoder(resolvedMBS), carparks: fakeCarparks([]) }),
      config,
    );
    expect(reply).toMatch(/no car parks with availability data nearby/i);
  });

  it("6. none within 500 m but some within 1 km → widened search, reply notes it", async () => {
    const carparks = [cp("D", 780, 200, 300)];
    const { reply, newState } = await handleMessage(
      owner(),
      emptyState(),
      providers({ llm: parkingRequest(), geocoder: fakeGeocoder(resolvedMBS), carparks: fakeCarparks(carparks) }),
      config,
    );
    expect(reply).toMatch(/widened/i);
    expect(reply).toContain("1 km");
    expect(reply).toContain("Car Park D");
    expect(newState.offeredCarparkIds).toEqual(["D"]);
  });

  it("7. destination outside Singapore → refusal stating the reason", async () => {
    const { reply, newState } = await handleMessage(
      owner("take me to Kuala Lumpur"),
      emptyState(),
      providers({ llm: parkingRequest("Kuala Lumpur"), geocoder: fakeGeocoder({ status: "outside_singapore" }) }),
      config,
    );
    expect(reply).toMatch(/outside singapore/i);
    expect(newState.destination).toBeNull();
  });

  it("8. destination not found → refusal stating it couldn't find the place", async () => {
    const { reply } = await handleMessage(
      owner("asdkjfh"),
      emptyState(),
      providers({ llm: parkingRequest("asdkjfh"), geocoder: fakeGeocoder({ status: "not_found" }) }),
      config,
    );
    expect(reply).toMatch(/couldn't find/i);
  });

  it("9. ambiguous destination → disambiguation prompt, no Suggestion yet", async () => {
    const ambiguous: GeocodeResult = {
      status: "ambiguous",
      options: [
        { name: "SERANGOON MRT", coordinates: at(0) },
        { name: "SERANGOON GARDENS", coordinates: at(0) },
      ],
    };
    const { reply, newState } = await handleMessage(
      owner("Serangoon"),
      emptyState(),
      providers({ llm: parkingRequest("Serangoon"), geocoder: fakeGeocoder(ambiguous) }),
      config,
    );
    expect(reply).toMatch(/which did you mean/i);
    expect(reply).toContain("SERANGOON MRT");
    expect(reply).toContain("SERANGOON GARDENS");
    expect(reply).not.toMatch(/lots free/);
    expect(newState.destination).toBeNull();
  });

  it("10. non-parking-request message → asks for a Singapore destination", async () => {
    const { reply } = await handleMessage(
      owner("how are you?"),
      emptyState(),
      providers({ llm: fakeLlm({ intent: "other" }) }),
      config,
    );
    expect(reply).toMatch(/singapore/i);
    expect(reply).toMatch(/postal code|address|place/i);
  });

  it("11. suggest-another → next unseen batch, then reports exhaustion", async () => {
    const carparks = [cp("A", 100, 200, 300), cp("B", 200, 200, 300), cp("C", 300, 200, 300), cp("D", 400, 200, 300)];
    // First: a normal parking request establishes the Destination and offers A,B,C.
    const first = await handleMessage(
      owner(),
      emptyState(),
      providers({ llm: parkingRequest(), geocoder: fakeGeocoder(resolvedMBS), carparks: fakeCarparks(carparks) }),
      config,
    );
    expect(first.newState.offeredCarparkIds).toEqual(["A", "B", "C"]);

    // Suggest-another: returns the next unseen batch (D).
    const suggestProviders = providers({ llm: fakeLlm({ intent: "suggest_another" }), carparks: fakeCarparks(carparks) });
    const second = await handleMessage(owner("got anything else?"), first.newState, suggestProviders, config);
    expect(second.reply).toMatch(/more car parks/i);
    expect(second.reply).toContain("Car Park D");
    expect(second.reply).not.toContain("Car Park A");
    expect(second.newState.offeredCarparkIds).toEqual(["A", "B", "C", "D"]);

    // Suggest-another again: nothing left → exhaustion.
    const third = await handleMessage(owner("more?"), second.newState, suggestProviders, config);
    expect(third.reply).toMatch(/that's all/i);
    expect(third.newState.offeredCarparkIds).toEqual(["A", "B", "C", "D"]);
  });

  it("12. message from a non-owner user ID → declined/ignored (no reply)", async () => {
    const { reply, newState } = await handleMessage(
      { text: "heading to Marina Bay Sands", fromUserId: 9999 },
      emptyState(),
      providers({ llm: parkingRequest(), geocoder: fakeGeocoder(resolvedMBS), carparks: fakeCarparks([cp("A", 100, 200, 300)]) }),
      config,
    );
    expect(reply).toBeNull();
    expect(newState).toEqual(emptyState());
  });

  it("13. free-lots but missing total capacity → absolute-floor rule applied", async () => {
    // A: 8 free, no capacity → low (below floor of 10). B: 20 free, no capacity → not low.
    const carparks = [cp("A", 111, 8, undefined), cp("B", 222, 20, undefined)];
    const { reply } = await handleMessage(
      owner(),
      emptyState(),
      providers({ llm: parkingRequest(), geocoder: fakeGeocoder(resolvedMBS), carparks: fakeCarparks(carparks) }),
      config,
    );
    // B (above floor) ranked before A (below floor), exactly one warning.
    expect(reply!.indexOf("Car Park B")).toBeLessThan(reply!.indexOf("Car Park A"));
    expect(reply!.match(/low availability/gi)).toHaveLength(1);
  });

  it("suggest-another after a restart (no Destination) asks for a destination", async () => {
    const emptyAfterRestart: ConversationState = emptyState();
    const { reply } = await handleMessage(
      owner("another one"),
      emptyAfterRestart,
      providers({ llm: fakeLlm({ intent: "suggest_another" }) }),
      config,
    );
    expect(reply).toMatch(/don't have a destination/i);
  });
});
