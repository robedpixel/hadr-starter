import { describe, expect, it } from "vitest";
import { parseInterpretation, quickClassify } from "./llm.js";

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

describe("parseInterpretation", () => {
  it("parses a clean parking_request object", () => {
    expect(parseInterpretation('{"intent":"parking_request","destinationText":"Marina Bay Sands"}')).toEqual({
      intent: "parking_request",
      destinationText: "Marina Bay Sands",
    });
  });

  it("tolerates markdown fences and surrounding prose", () => {
    const reply = 'Sure!\n```json\n{"intent": "suggest_another"}\n```';
    expect(parseInterpretation(reply)).toEqual({ intent: "suggest_another" });
  });

  it("falls back to other when a parking_request has no destinationText", () => {
    expect(parseInterpretation('{"intent":"parking_request"}')).toEqual({ intent: "other" });
  });

  it("finds the JSON object when reasoning around it also contains braces", () => {
    const reply =
      'The user wants to go somewhere {like a mall}, so this is a request:\n' +
      '{"intent":"parking_request","destinationText":"Jurong Point"}';
    expect(parseInterpretation(reply)).toEqual({ intent: "parking_request", destinationText: "Jurong Point" });
  });

  it("takes the final answer object when several are present", () => {
    const reply =
      'Example: {"intent":"other"}. My answer:\n{"intent":"parking_request","destinationText":"VivoCity"}';
    expect(parseInterpretation(reply)).toEqual({ intent: "parking_request", destinationText: "VivoCity" });
  });

  it("preserves braces that appear inside the destination string", () => {
    expect(parseInterpretation('{"intent":"parking_request","destinationText":"Block {A}"}')).toEqual({
      intent: "parking_request",
      destinationText: "Block {A}",
    });
  });

  it("falls back to other on unparseable or empty replies", () => {
    expect(parseInterpretation("no json here")).toEqual({ intent: "other" });
    expect(parseInterpretation('{"intent": broken')).toEqual({ intent: "other" });
    expect(parseInterpretation("")).toEqual({ intent: "other" });
  });
});
