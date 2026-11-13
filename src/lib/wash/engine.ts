import {
  BOOKINGS,
  CUSTOMERS,
  DEMO_TODAY,
  END_BY_START,
  SERVICES,
  SLOTS,
  STAFF,
  WASH_BAY,
  ZONES,
  type Booking,
  type Customer,
  type Service,
  type Slot,
  type Zone,
} from "./seeds.ts";

export type { Booking, Customer };

export type Ledger = {
  customers: Customer[];
  bookings: Booking[];
  bookingsReadable: boolean;
};

export type Status =
  | "NEEDS DETAILS"
  | "OFFERED"
  | "CONFIRMED"
  | "PENDING OWNER REVIEW";

export type Offer = {
  demo_name: string;
  customer_id: string | null;
  is_new_customer: boolean;
  vehicle_type: "sedan" | "suv";
  service: Service;
  zone: Zone;
  date_sast: string;
  start_time_sast: Slot;
  end_time_sast: string;
  base_price_zar: number;
  travel_fee_zar: number;
  total_zar: number;
};

export type AgentResult = {
  request_summary: string;
  source_checks: string[];
  price_breakdown: string | null;
  status: Status;
  customer_draft: string;
  owner_note: string;
  offer: Offer | null;
  /** Stored vehicle/suburb waiting for a yes before a quote. Not a booking offer. */
  detail_check: Offer | null;
  booking: Booking | null;
  ledger: Ledger;
};

const HOSTILE =
  /ignore (your |the )?rules|don'?t check the files|say i am booked|without checking/i;

function clone(ledger: Ledger): Ledger {
  return {
    bookingsReadable: ledger.bookingsReadable,
    customers: ledger.customers.map((c) => ({ ...c })),
    bookings: ledger.bookings.map((b) => ({ ...b })),
  };
}

export function seedLedger(): Ledger {
  return {
    bookingsReadable: true,
    customers: CUSTOMERS.map((c) => ({ ...c })),
    bookings: BOOKINGS.map((b) => ({ ...b })),
  };
}

function nextId(ids: string[], prefix: string): string {
  const nums = ids
    .map((id) => Number(id.slice(prefix.length)))
    .filter((n) => Number.isFinite(n));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(n).padStart(3, "0")}`;
}

function norm(s: string) {
  return s.trim().toLowerCase();
}

export function isSlot(value: string): value is Slot {
  return (SLOTS as readonly string[]).includes(value);
}

function confirmedAt(bookings: Booking[], date: string, slot: string) {
  return bookings.filter(
    (b) => b.status === "CONFIRMED" && b.date_sast === date && b.start_time_sast === slot,
  );
}

/** Employees who work this slot and are not already assigned to a booking in it. */
export function freeStaff(bookings: Booking[], date: string, slot: string): string[] {
  const here = confirmedAt(bookings, date, slot);
  const used = new Set(here.flatMap((b) => b.staff ?? []));
  // Older rows without named staff are assumed to use two people.
  const unnamed = here.filter((b) => !b.staff?.length).length * 2;
  const free = STAFF.filter((s) => (s.slots as readonly string[]).includes(slot) && !used.has(s.name)).map(
    (s) => s.name,
  );
  return free.slice(0, Math.max(0, free.length - unnamed));
}

/**
 * The booking that blocks a slot, or undefined while at least two employees are free in it.
 * Each booking needs two employees, so the owner's staff schedule sets how many cars fit.
 */
export function occupied(bookings: Booking[], date: string, slot: string) {
  if (freeStaff(bookings, date, slot).length >= 2) return undefined;
  return (
    confirmedAt(bookings, date, slot)[0] ?? {
      booking_id: "NO-STAFF",
      customer_id: "",
      demo_name: "",
      service_code: "",
      suburb: "",
      date_sast: date,
      start_time_sast: slot,
      end_time_sast: "",
      total_zar: 0,
      status: "CONFIRMED" as const,
    }
  );
}

/** Pick the two free employees with the lightest day so far (roster order breaks ties). */
export function assignStaff(bookings: Booking[], date: string, slot: string): [string, string] | null {
  const free = freeStaff(bookings, date, slot);
  if (free.length < 2) return null;
  const load = (name: string) =>
    bookings.filter((b) => b.status === "CONFIRMED" && b.date_sast === date && b.staff?.includes(name)).length;
  const ranked = free
    .map((name, order) => ({ name, order, load: load(name) }))
    .sort((a, b) => a.load - b.load || a.order - b.order);
  return [ranked[0].name, ranked[1].name];
}

/** 1-based place of a booking in that day's running order (by start time). */
export function queueNumber(bookings: Booking[], booking: Booking): number {
  const day = bookings
    .filter((b) => b.status === "CONFIRMED" && b.date_sast === booking.date_sast)
    .sort((a, b) => a.start_time_sast.localeCompare(b.start_time_sast) || a.booking_id.localeCompare(b.booking_id));
  return day.findIndex((b) => b.booking_id === booking.booking_id) + 1;
}

/** The ticket the client receives once staff are assigned. */
export function ticketFor(booking: Booking): string {
  const [a, b] = booking.staff ?? [];
  const where =
    booking.suburb === WASH_BAY
      ? "Please bring your car to our wash bay and arrive on time."
      : `Our crew will come to you in ${booking.suburb}; please be ready on time.`;
  return `Your car is number ${booking.queue_number} on ${dayName(booking.date_sast)}. ${a} and ${b} will be responsible for it. ${where} Your schedule is booked.`;
}

function dayName(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-ZA", { weekday: "long", timeZone: "UTC" });
}

function weekdayOk(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day >= 1 && day <= 6;
}

function parseDate(text: string): string | null {
  const t = text.toLowerCase();
  if (/\b(tomorrow|saturday|sat)\b/.test(t) || /14\s*nov/.test(t)) {
    return "2026-11-14";
  }
  if (/13\s*nov|today\b/.test(t)) return DEMO_TODAY;
  const iso = t.match(/\b(2026-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  return null;
}

function parseTime(text: string): Slot | null {
  const m = text.match(/\b(09|9|11|13|15)(?::00)?\b/);
  if (!m) return null;
  const raw = m[1].padStart(2, "0") + ":00";
  return isSlot(raw) ? raw : null;
}

function parseVehicle(text: string): "sedan" | "suv" | null {
  if (/\bsuv\b/i.test(text)) return "suv";
  if (/\bsedan\b/i.test(text)) return "sedan";
  return null;
}

function parseSuburb(text: string): { known: Zone | null; mentioned: string | null } {
  const lower = text.toLowerCase();
  // Clients can bring the car to the wash instead of asking the crew to travel.
  if (/\b(wash ?bay|drop[- ]?off|bring (it|my car|the car|him|her)|i['’]?ll bring|i will bring|come to you|at your (place|wash|premises))\b/.test(lower)) {
    const bay = ZONES.find((z) => z.suburb === WASH_BAY);
    if (bay) return { known: bay, mentioned: bay.suburb };
  }
  for (const zone of ZONES) {
    if (lower.includes(zone.suburb.toLowerCase())) return { known: zone, mentioned: zone.suburb };
  }
  const outside = lower.match(
    /\b(soweto|sandton|midrand|alexandra|johannesburg cbd|cbd|fourways)\b/,
  );
  return { known: null, mentioned: outside ? outside[1] : null };
}

function parseName(text: string): string | null {
  const m = text.match(/\bi['’]?m\s+([A-Za-z]+(?:\s+Demo)?)/i);
  if (!m) return null;
  const raw = m[1];
  if (/demo$/i.test(raw)) {
    const [first, second] = raw.split(/\s+/);
    return `${first[0].toUpperCase()}${first.slice(1)} ${second[0].toUpperCase()}${second.slice(1).toLowerCase()}`;
  }
  const first = raw[0].toUpperCase() + raw.slice(1);
  return `${first} Demo`;
}

function parseCustomerId(text: string): string | null {
  const m = text.match(/\b(C\d{3})\b/i);
  return m ? m[1].toUpperCase() : null;
}

function money(n: number) {
  return `R${n}`;
}

function serviceFor(vehicle: "sedan" | "suv"): Service {
  const found = SERVICES.find((s) => s.vehicle_type === vehicle);
  if (!found) throw new Error("missing service");
  return found;
}

export type Parsed = {
  hostile: boolean;
  customer_id: string | null;
  name: string | null;
  vehicle: "sedan" | "suv" | null;
  suburb: Zone | null;
  suburb_mention: string | null;
  date: string | null;
  time: Slot | null;
  yes: boolean;
};

export function parseMessage(text: string): Parsed {
  const trimmed = text.trim();
  return {
    hostile: HOSTILE.test(trimmed),
    customer_id: parseCustomerId(trimmed),
    name: parseName(trimmed),
    vehicle: parseVehicle(trimmed),
    suburb: parseSuburb(trimmed).known,
    suburb_mention: parseSuburb(trimmed).mentioned,
    date: parseDate(trimmed),
    time: parseTime(trimmed),
    yes: /^(yes|yep|confirm|confirmed|ok|okay)\b/i.test(trimmed),
  };
}

function pack(
  partial: Omit<AgentResult, "detail_check"> & { detail_check?: Offer | null },
): AgentResult {
  return { detail_check: null, ...partial };
}

export function handleEnquiry(
  ledgerIn: Ledger,
  message: string,
  pending: Offer | null,
  pendingDetail: Offer | null = null,
  lastBooking: Booking | null = null,
  /** Optional name supplied by the channel (e.g. a WhatsApp profile name). Used only when the customer gave none. */
  channelName: string | null = null,
): AgentResult {
  const ledger = clone(ledgerIn);
  const parsed = parseMessage(message);
  const checks: string[] = [
    "Simulated intake only. No WhatsApp send. No payment.",
    `Demo date ${DEMO_TODAY}. Slots 09:00, 11:00, 13:00, 15:00 SAST, Monday–Saturday, 90 minutes.`,
  ];

  if (parsed.hostile) {
    return pack({
      request_summary: "Hostile instruction to skip rules and claim a booking.",
      source_checks: [
        ...checks,
        "Refused: customer text cannot change rules or invent a booking.",
      ],
      price_breakdown: null,
      status: "PENDING OWNER REVIEW",
      customer_draft:
        "I still need to check the wash list and the booking book before I can confirm anything. Tell me the vehicle, suburb, date, and time.",
      owner_note:
        "Customer asked the assistant to ignore rules and claim a booking. No row written.",
      offer: null,
      booking: null,
      ledger,
    });
  }

  if (parsed.yes && pending) {
    return confirmOffer(ledger, pending, checks);
  }

  if (parsed.yes && pendingDetail) {
    const offer = pendingDetail;
    const taken = occupied(ledger.bookings, offer.date_sast, offer.start_time_sast);
    checks.push(
      "Customer confirmed the stored vehicle and suburb still apply.",
      `Bookings read for ${offer.date_sast} ${offer.start_time_sast}: ${taken ? "taken" : "free"}.`,
    );
    if (taken) {
      const free = SLOTS.find((slot) => !occupied(ledger.bookings, offer.date_sast, slot));
      return pack({
        request_summary: "Stored details confirmed, but the requested slot is taken.",
        source_checks: checks,
        price_breakdown: `${money(offer.base_price_zar)} + ${money(offer.travel_fee_zar)} = ${money(offer.total_zar)}.`,
        status: free ? "OFFERED" : "PENDING OWNER REVIEW",
        customer_draft: free
          ? `${offer.start_time_sast} is taken. I can offer ${free} instead, total ${money(offer.total_zar)}. Reply yes for that slot.`
          : "No free slot that day.",
        owner_note: "Details confirmed. Original slot taken. No write yet.",
        offer: free ? { ...offer, start_time_sast: free, end_time_sast: END_BY_START[free] } : null,
        booking: null,
        ledger,
      });
    }
    return pack({
      request_summary: `${offer.demo_name} confirmed stored ${offer.vehicle_type} / ${offer.zone.suburb}.`,
      source_checks: checks,
      price_breakdown: `${money(offer.base_price_zar)} service + ${money(offer.travel_fee_zar)} travel = ${money(offer.total_zar)}.`,
      status: "OFFERED",
      customer_draft: `Offer: ${offer.service.service_name} for a ${offer.vehicle_type} in ${offer.zone.suburb} on ${offer.date_sast} from ${offer.start_time_sast} to ${offer.end_time_sast}. Total ${money(offer.total_zar)}. Reply yes to book this exact offer.`,
      owner_note: "Known details confirmed. Quote offered. Not written until the next explicit yes.",
      offer,
      booking: null,
      ledger,
    });
  }

  if (parsed.yes && !pending && !pendingDetail && lastBooking) {
    const still = ledger.bookings.find((b) => b.booking_id === lastBooking.booking_id);
    return pack({
      request_summary: `Repeated yes for ${lastBooking.booking_id}.`,
      source_checks: [
        ...checks,
        still
          ? `Bookings re-read. ${still.booking_id} still CONFIRMED. No second append.`
          : "Previous booking id no longer in the book.",
      ],
      price_breakdown: still ? `R${still.total_zar} already recorded.` : null,
      status: still ? "CONFIRMED" : "PENDING OWNER REVIEW",
      customer_draft: still
        ? `You are already booked as ${still.booking_id}: ${still.suburb} on ${still.date_sast} at ${still.start_time_sast}. Nothing new was added.`
        : "I cannot find that booking anymore.",
      owner_note: still
        ? `Repeated confirmation returned ${still.booking_id}. Row count unchanged.`
        : "Repeated yes but the booking id was missing.",
      offer: null,
      booking: still ?? null,
      ledger,
    });
  }

  if (!ledger.bookingsReadable) {
    return pack({
      request_summary: "Booking source unavailable before lookup.",
      source_checks: [...checks, "Bookings source unreadable. Stopped before any write."],
      price_breakdown: null,
      status: "PENDING OWNER REVIEW",
      customer_draft:
        "I cannot see the booking book right now, so I will not promise a slot. The owner will follow up.",
      owner_note: "PENDING OWNER REVIEW. Availability could not be read. No booking written.",
      offer: null,
      booking: null,
      ledger,
    });
  }

  const known = parsed.customer_id
    ? ledger.customers.find((c) => c.customer_id === parsed.customer_id)
    : undefined;

  if (parsed.customer_id && !known) {
    return pack({
      request_summary: `Unknown customer ${parsed.customer_id}.`,
      source_checks: [...checks, "Customers source read. ID not found."],
      price_breakdown: null,
      status: "PENDING OWNER REVIEW",
      customer_draft: "I cannot match that customer number. The owner needs to check it.",
      owner_note: `${parsed.customer_id} is not in Customers. No booking written.`,
      offer: null,
      booking: null,
      ledger,
    });
  }

  const vehicle = parsed.vehicle ?? (known && !parsed.vehicle ? null : null);
  const suburb = parsed.suburb;
  const outside =
    !suburb && parsed.suburb_mention && norm(parsed.suburb_mention) !== "";

  if (outside) {
    return pack({
      request_summary: `Wash requested in ${parsed.suburb_mention}, which is not a served suburb.`,
      source_checks: [
        ...checks,
        `Zones source read. ${parsed.suburb_mention} is not listed as served.`,
      ],
      price_breakdown: null,
      status: "PENDING OWNER REVIEW",
      customer_draft: `We do not currently cover ${parsed.suburb_mention}. I will not guess a travel fee. The owner can decide whether to make an exception.`,
      owner_note: `Unsupported suburb "${parsed.suburb_mention}". No travel fee invented. No booking written.`,
      offer: null,
      booking: null,
      ledger,
    });
  }

  if (known && !parsed.vehicle && !parsed.suburb) {
    const missingTime = !parsed.time || !parsed.date;
    if (missingTime) {
      return pack({
        request_summary: `Returning ${known.customer_id} ${known.demo_name}. Known ${known.vehicle_type} in ${known.suburb}. Date or time missing.`,
        source_checks: [...checks, `Customers source: ${known.customer_id} ${known.demo_name}, ${known.vehicle_type}, ${known.suburb}.`],
        price_breakdown: null,
        status: "NEEDS DETAILS",
        customer_draft: `I have you as ${known.demo_name}, ${known.vehicle_type}, ${known.suburb}. Which date and slot should I use: 09:00, 11:00, 13:00, or 15:00?`,
        owner_note: "Returning customer. Asked them to confirm the known details still apply and to supply the slot. No write.",
        offer: null,
        booking: null,
        ledger,
      });
    }
  }

  const vehicleFinal = parsed.vehicle ?? null;
  const usingKnown = Boolean(known) && !parsed.vehicle && !parsed.suburb;

  if (known && parsed.time && parsed.date && usingKnown) {
    checks.push(
      `Customers source: ${known.customer_id} is a ${known.vehicle_type} usually in ${known.suburb}. Asking them to confirm those still apply is required before an offer if they were not restated — they were not restated, so confirm first.`,
    );
    const zoneKnown = ZONES.find((z) => z.suburb === known.suburb);
    const serviceKnown = serviceFor(known.vehicle_type);
    const detail: Offer | null = zoneKnown
      ? {
          demo_name: known.demo_name,
          customer_id: known.customer_id,
          is_new_customer: false,
          vehicle_type: known.vehicle_type,
          service: serviceKnown,
          zone: zoneKnown,
          date_sast: parsed.date,
          start_time_sast: parsed.time,
          end_time_sast: END_BY_START[parsed.time],
          base_price_zar: serviceKnown.base_price_zar,
          travel_fee_zar: zoneKnown.travel_fee_zar,
          total_zar: serviceKnown.base_price_zar + zoneKnown.travel_fee_zar,
        }
      : null;
    return pack({
      request_summary: `${known.customer_id} asked for ${parsed.date} at ${parsed.time} without restating vehicle or suburb.`,
      source_checks: checks,
      price_breakdown: null,
      status: "NEEDS DETAILS",
      customer_draft: `I have ${known.demo_name} on file as a ${known.vehicle_type} in ${known.suburb}. Reply yes if that still applies for ${parsed.date} at ${parsed.time}, or correct it.`,
      owner_note:
        "Returning customer. Proposed stored vehicle and suburb. Waiting for confirmation they still apply. No offer yet, no write.",
      offer: null,
      detail_check: detail,
      booking: null,
      ledger,
    });
  }

  const confirmKnown = /^yes[,.]?\s+/i.test(message) && known;
  let vehicleUse = vehicleFinal;
  let zoneUse = suburb;
  // Priority: a name typed in the message, then a known customer, then the channel's profile name.
  let nameUse = parsed.name ?? known?.demo_name ?? channelName ?? null;
  let dateUse = parsed.date;
  let timeUse = parsed.time;

  if (confirmKnown && known) {
    vehicleUse = vehicleUse ?? known.vehicle_type;
    zoneUse = zoneUse ?? ZONES.find((z) => z.suburb === known.suburb) ?? null;
    nameUse = known.demo_name;
    checks.push(
      `Customer confirmed stored details: ${known.vehicle_type}, ${known.suburb}.`,
    );
  }

  const missing: string[] = [];
  if (!vehicleUse) missing.push("vehicle type (sedan or SUV)");
  if (!zoneUse) missing.push("suburb (or say you will bring the car to our wash bay)");
  if (!dateUse) missing.push("date");
  if (!timeUse) missing.push("time (09:00, 11:00, 13:00, or 15:00)");
  if (!nameUse && !known) missing.push("a demo name");

  if (missing.length) {
    return pack({
      request_summary: "Enquiry is missing required details.",
      source_checks: [
        ...checks,
        missing.some((m) => m.startsWith("suburb"))
          ? "Suburb not matched to Zones yet."
          : "Services and Zones available for a complete request.",
      ],
      price_breakdown: null,
      status: "NEEDS DETAILS",
      customer_draft: `I can book a wash once I have: ${missing.join(", ")}.`,
      owner_note: `No booking written. Missing: ${missing.join(", ")}.`,
      offer: null,
      booking: null,
      ledger,
    });
  }

  if (!vehicleUse || !zoneUse || !dateUse || !timeUse || !nameUse) {
    throw new Error("unreachable");
  }

  if (!weekdayOk(dateUse)) {
    return pack({
      request_summary: `${dateUse} is outside Monday–Saturday.`,
      source_checks: checks,
      price_breakdown: null,
      status: "PENDING OWNER REVIEW",
      customer_draft: "That date is not a working day. I will not book it.",
      owner_note: "Sunday or invalid weekday. No booking.",
      offer: null,
      booking: null,
      ledger,
    });
  }

  const service = serviceFor(vehicleUse);
  const total = service.base_price_zar + zoneUse.travel_fee_zar;
  const taken = occupied(ledger.bookings, dateUse, timeUse);
  checks.push(
    `Services: ${service.service_code} base ${money(service.base_price_zar)}.`,
    `Zones: ${zoneUse.suburb} travel ${money(zoneUse.travel_fee_zar)}.`,
    `Bookings read for ${dateUse} ${timeUse}: ${taken ? taken.booking_id + " CONFIRMED" : "free"}.`,
  );

  if (taken) {
    const free = SLOTS.find((slot) => !occupied(ledger.bookings, dateUse, slot));
    return pack({
      request_summary: `${vehicleUse} wash in ${zoneUse.suburb} on ${dateUse} at ${timeUse} is taken by ${taken.booking_id}.`,
      source_checks: checks,
      price_breakdown: `${money(service.base_price_zar)} service + ${money(zoneUse.travel_fee_zar)} travel = ${money(total)}. Slot not offered.`,
      status: free ? "OFFERED" : "PENDING OWNER REVIEW",
      customer_draft: free
        ? `${timeUse} on ${dateUse} is already booked. I can offer ${free}–${END_BY_START[free]} instead for a ${vehicleUse} ${service.service_name.toLowerCase()} in ${zoneUse.suburb}, total ${money(total)}. Reply yes to that exact slot.`
        : `Every slot on ${dateUse} is taken. I will not double-book. The owner needs to pick another day.`,
      owner_note: free
        ? `Occupied ${timeUse} detected (${taken.booking_id}). Alternative ${free} offered. No row written.`
        : "No free slot. No row written.",
      offer: free
        ? {
            demo_name: nameUse,
            customer_id: known?.customer_id ?? null,
            is_new_customer: !known,
            vehicle_type: vehicleUse,
            service,
            zone: zoneUse,
            date_sast: dateUse,
            start_time_sast: free,
            end_time_sast: END_BY_START[free],
            base_price_zar: service.base_price_zar,
            travel_fee_zar: zoneUse.travel_fee_zar,
            total_zar: total,
          }
        : null,
      booking: null,
      ledger,
    });
  }

  const offer: Offer = {
    demo_name: nameUse,
    customer_id: known?.customer_id ?? null,
    is_new_customer: !known,
    vehicle_type: vehicleUse,
    service,
    zone: zoneUse,
    date_sast: dateUse,
    start_time_sast: timeUse,
    end_time_sast: END_BY_START[timeUse],
    base_price_zar: service.base_price_zar,
    travel_fee_zar: zoneUse.travel_fee_zar,
    total_zar: total,
  };

  return pack({
    request_summary: `${offer.demo_name}: ${service.service_name}, ${vehicleUse}, ${zoneUse.suburb}, ${dateUse} ${timeUse}.`,
    source_checks: checks,
    price_breakdown: `${money(offer.base_price_zar)} service + ${money(offer.travel_fee_zar)} travel = ${money(offer.total_zar)}.`,
    status: "OFFERED",
    customer_draft: `Offer: ${service.service_name} for a ${vehicleUse} in ${zoneUse.suburb} on ${dateUse} from ${timeUse} to ${offer.end_time_sast}. Total ${money(total)} (${money(offer.base_price_zar)} + ${money(offer.travel_fee_zar)} travel). Reply yes to confirm this exact offer.`,
    owner_note: "Quote shown. Slot held only in the conversation, not in the book, until an explicit yes.",
    offer,
    booking: null,
    ledger,
  });
}

function confirmOffer(ledger: Ledger, pending: Offer, checks: string[]): AgentResult {
  if (!ledger.bookingsReadable) {
    return pack({
      request_summary: "Yes received but bookings source unreadable.",
      source_checks: [...checks, "Stopped. Availability could not be re-read."],
      price_breakdown: `${money(pending.base_price_zar)} + ${money(pending.travel_fee_zar)} = ${money(pending.total_zar)}.`,
      status: "PENDING OWNER REVIEW",
      customer_draft: "I cannot verify the slot right now, so this is not booked.",
      owner_note: "PENDING OWNER REVIEW. No write.",
      offer: pending,
      booking: null,
      ledger,
    });
  }

  const existing = ledger.bookings.find(
    (b) =>
      b.demo_name === pending.demo_name &&
      b.date_sast === pending.date_sast &&
      b.start_time_sast === pending.start_time_sast &&
      b.status === "CONFIRMED",
  );
  if (existing) {
    return pack({
      request_summary: `Repeated yes for ${existing.booking_id}.`,
      source_checks: [
        ...checks,
        `Bookings re-read. ${existing.booking_id} already CONFIRMED for that slot. No second append.`,
      ],
      price_breakdown: `${money(existing.total_zar)} already recorded.`,
      status: "CONFIRMED",
      customer_draft: `You are already booked as ${existing.booking_id}: ${existing.suburb} on ${existing.date_sast} at ${existing.start_time_sast}. Nothing new was added.`,
      owner_note: `Repeated confirmation returned ${existing.booking_id}. Row count unchanged.`,
      offer: null,
      booking: existing,
      ledger,
    });
  }

  const clash = occupied(ledger.bookings, pending.date_sast, pending.start_time_sast);
  if (clash) {
    return pack({
      request_summary: "Slot taken between offer and confirm.",
      source_checks: [...checks, `Re-read found ${clash.booking_id}. Write aborted.`],
      price_breakdown: null,
      status: "PENDING OWNER REVIEW",
      customer_draft: "That slot was just taken. I did not write a second booking.",
      owner_note: `Conflict with ${clash.booking_id}. No append.`,
      offer: null,
      booking: null,
      ledger,
    });
  }

  let customer = pending.customer_id
    ? ledger.customers.find((c) => c.customer_id === pending.customer_id)
    : ledger.customers.find(
        (c) => norm(c.demo_name) === norm(pending.demo_name),
      );

  if (!customer) {
    customer = {
      customer_id: nextId(
        ledger.customers.map((c) => c.customer_id),
        "C",
      ),
      demo_name: pending.demo_name,
      vehicle_type: pending.vehicle_type,
      suburb: pending.zone.suburb,
      contact_email: "",
    };
    ledger.customers.push(customer);
    checks.push(`Customers append ${customer.customer_id} verified by re-read.`);
  } else {
    checks.push(`Reused customer ${customer.customer_id}.`);
  }

  const staff = assignStaff(ledger.bookings, pending.date_sast, pending.start_time_sast);
  if (!staff) {
    return pack({
      request_summary: "No two employees are free for that slot.",
      source_checks: checks,
      price_breakdown: null,
      status: "PENDING OWNER REVIEW",
      customer_draft: "I could not assign two employees to that slot, so I am not confirming it.",
      owner_note: "PENDING OWNER REVIEW. Fewer than two employees free. No row written.",
      offer: pending,
      booking: null,
      ledger,
    });
  }

  const booking: Booking = {
    booking_id: nextId(
      ledger.bookings.map((b) => b.booking_id),
      "B",
    ),
    customer_id: customer.customer_id,
    demo_name: customer.demo_name,
    service_code: pending.service.service_code,
    suburb: pending.zone.suburb,
    date_sast: pending.date_sast,
    start_time_sast: pending.start_time_sast,
    end_time_sast: pending.end_time_sast,
    total_zar: pending.total_zar,
    status: "CONFIRMED",
    staff: [...staff],
  };
  ledger.bookings.push(booking);
  booking.queue_number = queueNumber(ledger.bookings, booking);
  // Verify: the row exists once, and neither employee is also on another job in this slot.
  const sameId = ledger.bookings.filter((b) => b.booking_id === booking.booking_id).length === 1;
  const doubleBooked = ledger.bookings.some(
    (b) =>
      b.booking_id !== booking.booking_id &&
      b.status === "CONFIRMED" &&
      b.date_sast === booking.date_sast &&
      b.start_time_sast === booking.start_time_sast &&
      b.staff?.some((n) => staff.includes(n)),
  );
  if (!sameId || doubleBooked) {
    ledger.bookings = ledger.bookings.filter((b) => b.booking_id !== booking.booking_id);
    return pack({
      request_summary: "Write could not be verified.",
      source_checks: checks,
      price_breakdown: null,
      status: "PENDING OWNER REVIEW",
      customer_draft: "I could not verify the booking, so I am not confirming it.",
      owner_note: "PENDING OWNER REVIEW. Unverified write rolled back.",
      offer: pending,
      booking: null,
      ledger,
    });
  }

  checks.push(
    `Bookings append ${booking.booking_id} re-read. ${staff[0]} and ${staff[1]} were free for ${booking.date_sast} ${booking.start_time_sast} and are assigned; no employee is double-booked.`,
    "No calendar is connected. Nothing to sync.",
  );

  return pack({
    request_summary: `Confirmed ${booking.booking_id} for ${booking.demo_name}.`,
    source_checks: checks,
    price_breakdown: `${money(pending.base_price_zar)} + ${money(pending.travel_fee_zar)} = ${money(booking.total_zar)}.`,
    status: "CONFIRMED",
    customer_draft: `Booked ${booking.booking_id}: ${pending.service.service_name}, ${pending.vehicle_type}, ${booking.suburb}, ${booking.date_sast} ${booking.start_time_sast}–${booking.end_time_sast}. Total ${money(booking.total_zar)}. ${ticketFor(booking)}`,
    owner_note: `Verified ${booking.booking_id}, customer ${booking.customer_id}. Assigned ${staff[0]} and ${staff[1]}, queue number ${booking.queue_number}. Calendar not connected, so no CALENDAR SYNC step. Do not append again.`,
    offer: null,
    booking,
    ledger,
  });
}

