/**
 * Demo or production.
 *
 *  - production: no sample businesses, no seeded bookings or customers, the simulated demo pages are off.
 *                Everything comes from owners who register, clients who message on WhatsApp, and the database.
 *  - demo:       the three sample businesses, seeded bookings and the presenter pages, for rehearsals.
 *
 * Set WASHSLOT_MODE=production or WASHSLOT_MODE=demo. When unset, a configured DATABASE_URL means production
 * (real storage means real data); otherwise demo.
 */
export type Mode = "demo" | "production";

export function appMode(): Mode {
  const set = process.env.WASHSLOT_MODE?.trim().toLowerCase();
  if (set === "production" || set === "demo") return set;
  return process.env.DATABASE_URL?.trim() ? "production" : "demo";
}

export const isProduction = (): boolean => appMode() === "production";
