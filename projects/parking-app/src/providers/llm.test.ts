import { describe, expect, it } from "vitest";
import { extractDestinationText, parseIntent, quickClassify } from "./llm.js";

describe("quickClassify", () => {
  it("treats a bare 6-digit string as a postal-code parking request", () => {
    expect(quickClassify("049483")).toEqual({ intent: "parking_request", destinationText: "049483" });
  });

  it("trims surrounding whitespace on a bare postal code", () => {
    expect(quickClassify("  018956 ")).toEqual({ intent: "parking_request", destinationText: "018956" });
  });

  it("defers to the model for anything that isn't exactly 6 digits", () => {
    expect(quickClassify("12345")).toBeNull(); // 5 digits
    expect(quickClassify("1234567")).toBeNull(); // 7 digits
    expect(quickClassify("313 Somerset")).toBeNull();
    expect(quickClassify("anything else?")).toBeNull();
  });
});

describe("extractDestinationText", () => {
  it("returns a bare place name unchanged", () => {
    expect(extractDestinationText("Jurong Point")).toBe("Jurong Point");
    expect(extractDestinationText("313 Somerset")).toBe("313 Somerset");
  });

  it("strips a leading filler phrase, longest match first", () => {
    expect(extractDestinationText("I want to go to Jurong Point")).toBe("Jurong Point");
    expect(extractDestinationText("take me to Marina Bay Sands")).toBe("Marina Bay Sands");
    expect(extractDestinationText("parking near VivoCity")).toBe("VivoCity");
    expect(extractDestinationText("go to Changi Airport")).toBe("Changi Airport");
  });

  it("strips trailing punctuation and whitespace", () => {
    expect(extractDestinationText("  heading to Bugis!  ")).toBe("Bugis");
  });

  it("does not strip a place that merely starts with filler letters", () => {
    expect(extractDestinationText("Toa Payoh")).toBe("Toa Payoh"); // not "to " prefix
  });
});

describe("parseIntent", () => {
  it("reads a clean intent object", () => {
    expect(parseIntent('{"intent":"parking_request"}')).toBe("parking_request");
    expect(parseIntent('{"intent":"suggest_another"}')).toBe("suggest_another");
    expect(parseIntent('{"intent":"other"}')).toBe("other");
  });

  it("tolerates markdown fences and surrounding prose", () => {
    expect(parseIntent('Sure!\n```json\n{"intent": "suggest_another"}\n```')).toBe("suggest_another");
  });

  it("finds the JSON object when reasoning around it also contains braces", () => {
    const reply = "The user names a place {a mall}, so:\n{\"intent\":\"parking_request\"}";
    expect(parseIntent(reply)).toBe("parking_request");
  });

  it("takes the final answer object when several are present", () => {
    expect(parseIntent('Example: {"intent":"other"}. Answer:\n{"intent":"parking_request"}')).toBe("parking_request");
  });

  it("falls back to other on unparseable, empty, or unknown replies", () => {
    expect(parseIntent("no json here")).toBe("other");
    expect(parseIntent('{"intent": broken')).toBe("other");
    expect(parseIntent("")).toBe("other");
    expect(parseIntent('{"intent":"nonsense"}')).toBe("other");
  });
});
