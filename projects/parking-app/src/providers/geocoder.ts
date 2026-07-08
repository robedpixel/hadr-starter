import type { Coordinates, Destination, GeocodeResult, Geocoder } from "../domain/types.js";
import { haversineMeters } from "../core/geo.js";

// OneMap's public search endpoint — no token required for search-based geocoding.
const SEARCH_URL = "https://www.onemap.gov.sg/api/common/elastic/search";

// Belt-and-braces Singapore bounding box (ADR-0002). OneMap only covers SG, so a
// hit outside this box almost certainly means a bad parse rather than a real place.
const SG_BBOX = { minLat: 1.13, maxLat: 1.48, minLng: 103.6, maxLng: 104.1 };

// When the top two matches are this far apart AND named differently, treat the
// query as ambiguous rather than silently picking the first.
const AMBIGUITY_DISTANCE_METERS = 750;

interface OneMapResult {
  SEARCHVAL: string;
  ADDRESS?: string;
  LATITUDE: string;
  LONGITUDE: string;
}

interface OneMapResponse {
  found: number;
  results: OneMapResult[];
}

const isPostalCode = (query: string): boolean => /^\d{6}$/.test(query.trim());

const inSingapore = (c: Coordinates): boolean =>
  c.lat >= SG_BBOX.minLat && c.lat <= SG_BBOX.maxLat && c.lng >= SG_BBOX.minLng && c.lng <= SG_BBOX.maxLng;

const toDestination = (r: OneMapResult): Destination => ({
  name: r.SEARCHVAL,
  coordinates: { lat: Number(r.LATITUDE), lng: Number(r.LONGITUDE) },
});

/** OneMap-backed resolver; also serves as the Singapore-validity check (ADR-0002). */
export function createOneMapGeocoder(): Geocoder {
  return {
    async resolve(query: string): Promise<GeocodeResult> {
      const url = new URL(SEARCH_URL);
      url.searchParams.set("searchVal", query);
      url.searchParams.set("returnGeom", "Y");
      url.searchParams.set("getAddrDetails", "Y");
      url.searchParams.set("pageNum", "1");

      const res = await fetch(url);
      if (!res.ok) throw new Error(`OneMap search failed: HTTP ${res.status}`);
      const body = (await res.json()) as OneMapResponse;

      if (!body.found || body.results.length === 0) return { status: "not_found" };

      const [first, second] = body.results;
      if (!first) return { status: "not_found" };

      const primary = toDestination(first);
      if (!inSingapore(primary.coordinates)) return { status: "outside_singapore" };

      // Postal codes are exact; never ambiguous.
      if (!isPostalCode(query) && second) {
        const alt = toDestination(second);
        const differentName = alt.name !== primary.name;
        const farApart = haversineMeters(primary.coordinates, alt.coordinates) > AMBIGUITY_DISTANCE_METERS;
        if (differentName && farApart) {
          const options = body.results.slice(0, 3).map(toDestination);
          return { status: "ambiguous", options };
        }
      }

      return { status: "resolved", destination: primary };
    },
  };
}
