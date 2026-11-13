/**
 * Car wash businesses on the platform: pure logic only (no storage). Where they live is up to repo.ts.
 *
 * Clients share a location pin and are shown the nearest APPROVED businesses. A new sign-up starts
 * "pending" so a stranger cannot put a fake business in front of clients; the platform admin approves it.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  DEMO_CONFIG,
  DEMO_ID,
  SLOTS,
  WASH_BAY,
  type Branch,
  type Business,
  type Service,
  type Zone,
} from "./seeds.ts";

export { DEMO_ID };
/** Opens the sample business's dashboard. Sample data only. */
export const DEMO_KEY = "demo";

export const hashKey = (key: string): string => createHash("sha256").update(key).digest("hex");

const now = () => new Date().toISOString();

/** Sample businesses so the nearest-wash search can be shown. Replaced by real sign-ups. */
export function seedBusinesses(): Business[] {
  const simple = (id: string, name: string, address: string, lat: number, lng: number, staff: string[]): Business => {
    const cfg = buildConfig({ name, address, lat, lng, sedanPrice: 110, suvPrice: 150, staff, travel: [] });
    return { id, name, ownerName: "Sample owner", phone: "", address, lat, lng, ...cfg, keyHash: hashKey(`sample-${id}`), status: "approved", example: true, createdAt: now() };
  };
  return [
    {
      id: DEMO_ID,
      name: "Demo Wash Co.",
      ownerName: "Demo owner",
      phone: "",
      address: "Rosebank, Johannesburg",
      lat: -26.1467,
      lng: 28.0436,
      ...DEMO_CONFIG,
      keyHash: hashKey(DEMO_KEY),
      status: "approved",
      example: true,
      createdAt: now(),
    },
    simple("sparkle-hand-wash", "Sparkle Hand Wash", "Melville, Johannesburg", -26.1818, 28.007, ["Themba", "Nandi", "Jabu"]),
    simple("sandton-shine", "Sandton Shine Car Care", "Sandton, Johannesburg", -26.1076, 28.0567, ["Pieter", "Lindiwe", "Musa", "Anele"]),
  ];
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export type Nearby = Business & { km: number };

/** The `n` nearest approved businesses to a pin. */
export function nearest(list: Business[], lat: number, lng: number, n = 3): Nearby[] {
  return list
    .filter((b) => b.status === "approved")
    .map((b) => ({ ...b, km: haversineKm({ lat, lng }, b) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}

/** Approved businesses whose address mentions what the client typed (a suburb), best matches first. */
export function byText(list: Business[], text: string, n = 3): Business[] {
  const words = text.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4);
  const approved = list.filter((b) => b.status === "approved");
  const hits = approved.filter((b) => words.some((w) => `${b.address} ${b.name}`.toLowerCase().includes(w)));
  return (hits.length ? hits : approved).slice(0, n);
}

type ConfigInput = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  sedanPrice: number;
  suvPrice: number;
  staff: string[];
  /** Suburbs the crew travels to, with the travel fee. */
  travel: { suburb: string; fee: number }[];
};

function buildConfig(i: ConfigInput) {
  const services: Service[] = [
    { service_code: "WASH_SEDAN", vehicle_type: "sedan", service_name: "Exterior and interior wash", base_price_zar: i.sedanPrice, duration_minutes: 90 },
    { service_code: "WASH_SUV", vehicle_type: "suv", service_name: "Exterior and interior wash", base_price_zar: i.suvPrice, duration_minutes: 90 },
  ];
  const zones: Zone[] = [
    ...i.travel.map((t) => ({ suburb: t.suburb, travel_fee_zar: t.fee, served: true })),
    { suburb: WASH_BAY, travel_fee_zar: 0, served: true },
  ];
  const branches: Branch[] = [
    { name: i.name, address: i.address, serves: i.travel.map((t) => t.suburb), lat: i.lat, lng: i.lng },
  ];
  return { services, zones, staff: i.staff.map((name) => ({ name, slots: SLOTS })), branches };
}

export type RegisterInput = {
  name: string;
  ownerName: string;
  phone: string;
  address: string;
  lat: number;
  lng: number;
  sedanPrice: number;
  suvPrice: number;
  staff: string[];
  travel?: { suburb: string; fee: number }[];
};

const clean = (s: unknown, max: number) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);

/**
 * Validate a sign-up and build the (pending) business. `existing` is the current list, for the duplicate-name check.
 * Throws a readable message on bad input. The returned object carries the plain `key` once; only its hash is kept.
 */
export function createBusiness(raw: RegisterInput, existing: Business[]): Business {
  const name = clean(raw.name, 60);
  const address = clean(raw.address, 120);
  const staff = (raw.staff ?? []).map((s) => clean(s, 30)).filter(Boolean);
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  const sedanPrice = Math.round(Number(raw.sedanPrice));
  const suvPrice = Math.round(Number(raw.suvPrice));
  if (name.length < 3) throw new Error("Business name must be at least 3 characters.");
  if (address.length < 5) throw new Error("Please give the address of your wash.");
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    throw new Error("Location is missing. Use “Use my location” or type the coordinates.");
  if (!(sedanPrice > 0 && sedanPrice < 5000) || !(suvPrice > 0 && suvPrice < 5000))
    throw new Error("Sedan and SUV prices must be amounts in rand.");
  if (staff.length < 2) throw new Error("List at least two employees: every job is done by two people.");
  if (existing.some((b) => b.name.toLowerCase() === name.toLowerCase())) throw new Error("That business name is already registered.");
  const travel = (raw.travel ?? [])
    .map((t) => ({ suburb: clean(t.suburb, 40), fee: Math.max(0, Math.round(Number(t.fee) || 0)) }))
    .filter((t) => t.suburb.length >= 3)
    .slice(0, 12);
  const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30)}-${randomBytes(2).toString("hex")}`;
  const key = randomBytes(12).toString("hex");
  return {
    id,
    name,
    ownerName: clean(raw.ownerName, 60),
    phone: clean(raw.phone, 20),
    address,
    lat,
    lng,
    ...buildConfig({ name, address, lat, lng, sedanPrice, suvPrice, staff, travel }),
    keyHash: hashKey(key),
    key,
    status: "pending",
    createdAt: now(),
  };
}

/** Public, safe-to-show view of a business (never includes the key or phone). */
export const publicView = (b: Business) => ({
  id: b.id,
  name: b.name,
  address: b.address,
  lat: b.lat,
  lng: b.lng,
  status: b.status,
  example: !!b.example,
  staffCount: b.staff.length,
});
