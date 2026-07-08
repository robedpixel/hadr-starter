import type { Carpark, CarparkProvider, Coordinates } from "../domain/types.js";

const DATAMALL_URL = "https://datamall2.mytransport.sg/ltaodataservice/CarParkAvailabilityv2";
const PAGE_SIZE = 500; // DataMall returns up to 500 records per page.

interface DataMallRecord {
  CarParkID: string;
  Development: string;
  Location: string; // "1.37326 103.84 " — "lat lng"
  AvailableLots: number | string;
  LotType: string; // C = cars, H = motorcycles, Y = heavy vehicles
}

interface DataMallResponse {
  value: DataMallRecord[];
}

function parseLocation(location: string): Coordinates | null {
  const parts = location.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function toCarpark(r: DataMallRecord): Carpark | null {
  const coordinates = parseLocation(r.Location);
  if (!coordinates) return null;
  const freeLots = Number(r.AvailableLots);
  if (!Number.isFinite(freeLots)) return null;
  return {
    id: r.CarParkID,
    name: r.Development || r.CarParkID,
    coordinates,
    freeLots,
    // DataMall's availability feed reports free lots but not total capacity, so
    // totalLots is intentionally omitted (the absolute-floor rule then applies).
  };
}

/** LTA DataMall Carpark Availability (ADR-0003). Only car (LotType "C") lots. */
export function createLtaCarparkProvider(accountKey: string): CarparkProvider {
  return {
    async availabilityNear(_point: Coordinates): Promise<Carpark[]> {
      // DataMall has no geo query; fetch every record with live data and let
      // the core filter by distance. Page through with $skip until exhausted.
      const carparks: Carpark[] = [];
      for (let skip = 0; ; skip += PAGE_SIZE) {
        const url = new URL(DATAMALL_URL);
        if (skip > 0) url.searchParams.set("$skip", String(skip));

        const res = await fetch(url, { headers: { AccountKey: accountKey, accept: "application/json" } });
        if (!res.ok) throw new Error(`LTA DataMall request failed: HTTP ${res.status}`);
        const body = (await res.json()) as DataMallResponse;

        const page = body.value ?? [];
        for (const record of page) {
          if (record.LotType !== "C") continue;
          const carpark = toCarpark(record);
          if (carpark) carparks.push(carpark);
        }
        if (page.length < PAGE_SIZE) break;
      }
      return carparks;
    },
  };
}
