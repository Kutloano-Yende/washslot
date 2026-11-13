/**
 * Step-by-step conversation for the booking agent.
 *
 * The engine understands ONE message at a time, so a client who answered in pieces (or in a paragraph) lost
 * their earlier answers. This layer keeps a Draft per conversation, pulls every detail it can out of each
 * message, then asks only the NEXT missing question, one at a time. When the draft is complete it hands a
 * clean request to the engine, which still does the pricing, slot check, staff assignment and verified write.
 * Deterministic and template-based: it never invents a price, a slot or a booking.
 */
import {
  handleEnquiry,
  occupied,
  pickBranch,
  ticketFor,
  type AgentResult,
  type Booking,
  type Ledger,
  type Offer,
  type Status,
} from "./engine.ts";
import { byText, nearest, type Nearby } from "./businesses.ts";
import { friendlyReply } from "./friendly.ts";
import { DEMO_ID, SLOTS, WASH_BAY, ZONES, type Business, type Slot } from "./seeds.ts";

export type Mode = "bring" | "collect" | "home";
type Field = "name" | "mode" | "location" | "vehicle" | "date" | "time" | "scent" | "allergies";

export type Draft = {
  name: string | null;
  mode: Mode | null;
  /** A served suburb from the zone list (collect / home visits). */
  suburb: string | null;
  /** Free-text place or street address the client gave. */
  place: string | null;
  vehicle: "sedan" | "suv" | null;
  make: string | null;
  date: string | null;
  time: Slot | null;
  scent: string | null;
  allergies: string | null;
  /** The question we last asked, so a short reply like "Sedan" lands in the right field. */
  awaiting: Field | null;
};

export type IntakeState = {
  draft: Draft;
  offer: Offer | null;
  detail: Offer | null;
  lastBooking: Booking | null;
  /** The car wash this client is booking with; null until they pick one from the registered businesses. */
  businessId: string | null;
  /** Business ids we just listed, in order, so "2" means the second one. */
  choices: string[];
  /** The assistant has already introduced itself in this conversation. */
  introduced?: boolean;
};

export const BOT = "Wash Buddy";
/** Owner-editable. */
export const SCENTS = ["Fresh linen", "Lemon", "Vanilla", "Ocean breeze", "No scent"] as const;

export const emptyDraft = (): Draft => ({
  name: null, mode: null, suburb: null, place: null, vehicle: null, make: null,
  date: null, time: null, scent: null, allergies: null, awaiting: null,
});
/** `businessId` defaults to the sample business (single-business mode); the store passes null to start with the nearest-wash question. */
export const emptyState = (businessId: string | null = DEMO_ID): IntakeState => ({
  draft: emptyDraft(), offer: null, detail: null, lastBooking: null, businessId, choices: [],
});

// ---------- parsing helpers ----------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTH_RE = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";
const DMY = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?${MONTH_RE}(?:,?\\s*(\\d{4}))?`, "i");
const MDY = new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`, "i");
const ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/;

export function todayISO(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
function validISO(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? toISO(y, m, d) : null;
}
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}
const weekdayOf = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/** Returns an ISO date, or null when the message holds no date. Years default to the next occurrence. */
export function parseDate(text: string, today: string): string | null {
  const t = text.toLowerCase();
  const iso = t.match(ISO);
  if (iso) return validISO(+iso[1], +iso[2], +iso[3]);
  const yearNow = +today.slice(0, 4);
  const withYear = (m: number, d: number, y?: string) => {
    if (y) return validISO(+y, m, d);
    const thisYear = validISO(yearNow, m, d);
    return thisYear && thisYear >= today ? thisYear : validISO(yearNow + 1, m, d);
  };
  const dmy = t.match(DMY);
  if (dmy) return withYear(MONTHS.indexOf(dmy[2].slice(0, 3)) + 1, +dmy[1], dmy[3]);
  const mdy = t.match(MDY);
  if (mdy) return withYear(MONTHS.indexOf(mdy[1].slice(0, 3)) + 1, +mdy[2], mdy[3]);
  if (/\btoday\b/.test(t)) return today;
  if (/\btomorrow\b/.test(t)) return addDays(today, 1);
  const wd = t.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\b/);
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[2].slice(0, 3));
    let delta = (target - weekdayOf(today) + 7) % 7;
    if (delta === 0 && wd[1]) delta = 7;
    return addDays(today, delta);
  }
  return null;
}

const STREET = "(?:street|st|road|rd|avenue|ave|drive|dr|lane|close|crescent|way)";

/** A slot, "other" for a time we do not run, or null. A bare number only counts when we just asked for a time. */
export function parseTime(text: string, awaitingTime: boolean): Slot | "other" | null {
  const t = text
    .toLowerCase()
    .replace(DMY, " ")
    .replace(MDY, " ")
    .replace(ISO, " ");
  const re = new RegExp(`\\b(\\d{1,2})\\s*(?::|h|\\.)?\\s*(\\d{2})?\\s*(am|pm)?\\b(?!\\s*(?:[a-z]+\\s+)?${STREET}\\b)`, "g");
  for (const m of t.matchAll(re)) {
    const explicit = m[3] || /[:h.]\s*\d{2}/.test(m[0]) || /o'?clock/.test(t) || new RegExp(`\\bat\\s+${m[1]}\\b`).test(t);
    if (!explicit && !awaitingTime) continue;
    let h = +m[1];
    if (m[3] === "pm" && h < 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
    if (h > 23) continue;
    const slot = `${pad(h)}:00`;
    return (SLOTS as readonly string[]).includes(slot) && (!m[2] || m[2] === "00") ? (slot as Slot) : "other";
  }
  return null;
}

const MAKES = ["bmw", "audi", "mercedes", "mercedes-benz", "vw", "volkswagen", "toyota", "ford", "nissan", "hyundai", "kia", "mazda", "honda", "suzuki", "renault", "jeep", "land rover", "volvo", "isuzu", "haval", "chery", "peugeot", "opel", "mini", "lexus", "subaru", "mitsubishi", "porsche", "jaguar"];
const MAKE_NAMES: Record<string, string> = { bmw: "BMW", vw: "VW", "mercedes-benz": "Mercedes-Benz" };
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

function parseVehicle(t: string): "sedan" | "suv" | null {
  if (/\b(suv|4x4|bakkie|crossover|double cab)\b/i.test(t)) return "suv";
  if (/\b(sedan|hatch(back)?|coupe|saloon)\b/i.test(t)) return "sedan";
  return null;
}
function parseMake(t: string): string | null {
  const lower = t.toLowerCase();
  const hit = MAKES.find((m) => new RegExp(`\\b${m}\\b`).test(lower));
  return hit ? (MAKE_NAMES[hit] ?? titleCase(hit)) : null;
}

function parseMode(t: string, awaitingMode: boolean): Mode | null {
  const s = t.toLowerCase();
  if (awaitingMode) {
    const d = s.trim().match(/^([123])\b/);
    if (d) return (["bring", "collect", "home"] as const)[+d[1] - 1];
  }
  if (/\b(at my (house|home|place|premises|flat|complex|office)|come to (me|my)|my (house|home)|wash it at my|crew (come|wash)|come wash)\b/.test(s)) return "home";
  if (/\b(collect|pick ?up|pickup|fetch|come get|get (the|my) car|take my car|come and get)\b/.test(s)) return "collect";
  if (/\b(bring|drop[- ]?off|drop it|wash bay|indoor|i('| wi)ll come|i can come|come to you|walk[- ]?in)\b/.test(s)) return "bring";
  return null;
}

function servedSuburb(t: string): string | null {
  const s = t.toLowerCase();
  return ZONES.find((z) => z.suburb !== WASH_BAY && s.includes(z.suburb.toLowerCase()))?.suburb ?? null;
}

const NOT_PLACES = /^(the|my|our|your|a|an|home|work|wash|bay|time|day|morning|afternoon|evening|least|once|most|first|case)$/i;
function placeMention(t: string): string | null {
  const m = t.match(/\b(?:i['’]?m\s+(?:at|in|from|staying in|based in)|i\s+live\s+in|live\s+in|located\s+(?:at|in)|from)\s+([A-Za-z][A-Za-z' -]{2,30}?)(?=[,.;!?]|\s+(?:and|but|i|my|can|please|at|on|around)\b|$)/i);
  const place = m?.[1]?.trim();
  return place && !NOT_PLACES.test(place) ? titleCase(place) : null;
}

function parseName(t: string): string | null {
  const m = t.match(/\b(?:i['’]?m|i am|my name is|this is|call me|name'?s)\s+([A-Za-z][A-Za-z'’-]{1,24})\b/i);
  const n = m?.[1];
  if (!n || /^(at|in|from|a|an|the|looking|here|going|trying|bringing|coming|ready|not|just|also|so|sorry|new)$/i.test(n)) return null;
  return titleCase(n.toLowerCase());
}
function bareName(t: string): string | null {
  const s = t.trim().replace(/[.!]+$/, "");
  if (!/^[A-Za-z][A-Za-z'’-]{1,24}(?:\s+[A-Za-z][A-Za-z'’-]{1,24}){0,2}$/.test(s)) return null;
  if (/^(yes|no|yep|ok|okay|hi|hey|hello|sedan|suv|none|skip|thanks|thank you)\b/i.test(s)) return null;
  return titleCase(s.split(/\s+/)[0].toLowerCase());
}

function parseScent(t: string): string | null {
  const s = t.toLowerCase();
  if (/\b(no scent|unscented|no fragrance|without scent|fragrance[- ]free)\b/.test(s)) return "No scent";
  if (/\b(linen|fresh)\b/.test(s)) return "Fresh linen";
  if (/\blemon\b/.test(s)) return "Lemon";
  if (/\bvanilla\b/.test(s)) return "Vanilla";
  if (/\b(ocean|breeze|sea)\b/.test(s)) return "Ocean breeze";
  return null;
}

const NONE = /^\s*(no|none|nope|nothing|n\/a|na|nil|no allergies|none thanks|no thanks)\s*[.!]*\s*$/i;

// ---------- the conversation ----------

const PLACE_NEEDED: Mode[] = ["collect", "home"];
const MODE_LABEL: Record<Mode, string> = { bring: "bringing it to us", collect: "we collect it", home: "we come to you" };

function nextField(d: Draft): Field | null {
  if (!d.name) return "name";
  if (!d.mode) return "mode";
  if (PLACE_NEEDED.includes(d.mode) && (!d.suburb || !d.place)) return "location";
  if (!d.vehicle || !d.make) return "vehicle";
  if (!d.date) return "date";
  if (!d.time) return "time";
  if (!d.scent) return "scent";
  if (!d.allergies) return "allergies";
  return null;
}

/** Online booking closes this many minutes before a slot starts, so the crew is not surprised. */
export const CUTOFF_MIN = 30;
/** The clock for the message being handled (set at the start of converse; JS runs one message at a time here). */
let clock = { today: "", nowMin: 0 };

export function minutesNowSAST(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return (get("hour") % 24) * 60 + get("minute");
}

/** A slot today that has started or is inside the cutoff cannot be booked online any more. */
const isClosed = (date: string, slot: string) => date === clock.today && Number(slot.slice(0, 2)) * 60 - CUTOFF_MIN < clock.nowMin;

function freeSlots(ledger: Ledger, date: string): Slot[] {
  return SLOTS.filter((s) => !occupied(ledger.bookings, date, s) && !isClosed(date, s));
}

const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

function question(f: Field, d: Draft, ledger: Ledger): string {
  switch (f) {
    case "name":
      return "What's your name?";
    case "mode":
      return `How would you like us to wash it, ${d.name}?\n1️⃣ I'll bring it to your wash\n2️⃣ Your team collects it from me\n3️⃣ Your crew washes it at my home\nReply with 1, 2 or 3 🙂`;
    case "location": {
      if (!d.suburb && !d.place) return "Which suburb are you in, and what's your street address?";
      if (!d.suburb) return "Which suburb is that in?";
      return "And what's the street address, so the team can find you?";
    }
    case "vehicle":
      if (!d.vehicle && !d.make) return "What car do you drive? Tell me the make and whether it's a sedan or an SUV (for example: BMW sedan).";
      if (!d.vehicle) return `Is your ${d.make} a sedan or an SUV?`;
      return `What make is your ${d.vehicle === "suv" ? "SUV" : "sedan"} (for example BMW, Toyota, VW)?`;
    case "date":
      return "Which day suits you? We're open Monday to Saturday.";
    case "time": {
      const free = d.date ? freeSlots(ledger, d.date) : [];
      return d.date
        ? free.length
          ? `What time works on ${longDate(d.date)}? Free slots: ${free.join(", ")}.`
          : `Every slot on ${longDate(d.date)} is taken. Which other day suits you?`
        : "What time suits you? We have 09:00, 11:00, 13:00 or 15:00.";
    }
    case "scent":
      return `Would you like a scent added? We have ${SCENTS.slice(0, -1).join(", ")}, or no scent.`;
    case "allergies":
      return "Last one: do you have any allergies or sensitivities (fragrance, chemicals, latex)? That way we use the right products on your car. Reply \"none\" if not.";
  }
}

function recap(newly: string[]): string {
  return newly.length ? `Got it ✅ ${newly.join(" · ")}\n\n` : "";
}

const NOW_INTENT = /\b(right now|come now|walk[- ]?in|asap|nearby|free now|available now|straight away|this morning|i'?m close|now)\b/i;
const GREETING = /^\s*(hi+|hey+|hello+|howzit|heita|yo|sawubona|molo|dumela|good (morning|afternoon|evening))\b/i;
const ASKS_WHO = /\b(your name|who are you|who is this|are you (a )?(bot|human|real|robot|ai))\b/i;
const HOSTILE = /ignore (your |the )?rules|don'?t check the files|say i am booked|without checking/i;
const YES = /^\s*(yes|yep|yeah|confirm|confirmed|ok|okay|sure|please do)\b/i;

export type ConverseResult = {
  reply: string;
  state: IntakeState;
  ledger: Ledger;
  status: Status;
  result: AgentResult | null;
};

/** Handle one inbound message. `today` is injectable for tests. */
export function converse(
  ledger: Ledger,
  stateIn: IntakeState,
  message: string,
  opts: {
    /** Minutes since midnight in South Africa; injectable for tests. */
    nowMinutes?: number;
    profileName?: string | null;
    today?: string;
    location?: { lat: number; lng: number } | null;
    /** The businesses on the platform (needed to choose a wash and to name the one being booked). */
    businesses?: Business[];
  } = {},
): ConverseResult {
  const today = opts.today ?? todayISO();
  clock = { today, nowMin: opts.nowMinutes ?? minutesNowSAST() };
  const state: IntakeState = { ...stateIn, draft: { ...stateIn.draft } };
  const d = state.draft;
  const text = message.trim();

  // 0. Several car washes are registered: find the client's nearest one first.
  if (!state.businessId && !HOSTILE.test(text)) return chooseBusiness(ledger, state, text, opts.location ?? null, opts.businesses ?? []);

  // 1. Things the engine already handles well: a pending offer, a repeated yes, a customer ID, tampering.
  const hostile = HOSTILE.test(text);
  const hasCustomerId = /\bC\d{3}\b/i.test(text);
  const repeatYes = YES.test(text) && !!state.lastBooking && !state.offer;
  if (hostile || hasCustomerId || state.offer || state.detail || repeatYes) {
    return viaEngine(ledger, state, text, opts.profileName ?? null);
  }

  // 2. Pull out everything this message tells us.
  const was = { ...d };
  const awaiting = d.awaiting;
  if (!d.name) d.name = parseName(text) ?? (awaiting === "name" ? bareName(text) : null);

  const mode = parseMode(text, awaiting === "mode");
  if (mode) d.mode = mode;

  const suburb = servedSuburb(text);
  const place = placeMention(text) ?? text.match(/\b(?:in|at|near)\s+([A-Z][A-Za-z'-]+(?:\s[A-Z][A-Za-z'-]+)?)/)?.[1] ?? null;
  let unservedPlace = place && !suburb && !servedSuburb(place) ? place : null;
  if (suburb && (d.mode ? PLACE_NEEDED.includes(d.mode) : true)) d.suburb = suburb;
  if (awaiting === "location") {
    if (!suburb && !d.suburb && text.length <= 80 && /[a-z]{3}/i.test(text) && !/\d/.test(text)) {
      const guess = titleCase(text.replace(/[.!]+$/, ""));
      if (!parseMode(text, false)) {
        d.place = d.place ?? guess;
        if (d.mode && PLACE_NEEDED.includes(d.mode)) unservedPlace = guess;
      }
    }
    if (/\d/.test(text) && new RegExp(`\\b${STREET}\\b`, "i").test(text)) d.place = text.slice(0, 120);
    else if (suburb && /\d/.test(text)) d.place = text.slice(0, 120);
  } else if (new RegExp(`\\d+\\s+[A-Za-z]+\\s+${STREET}\\b`, "i").test(text)) {
    d.place = text.match(new RegExp(`\\d+\\s+[A-Za-z' ]+?\\s+${STREET}\\b[^,.]*`, "i"))?.[0] ?? text.slice(0, 120);
  }

  const vehicle = parseVehicle(text);
  if (vehicle) d.vehicle = vehicle;
  const make = parseMake(text);
  if (make) d.make = make;
  if (!vehicle && awaiting === "vehicle" && !make) {
    /* nothing recognised: we ask again below */
  }

  let pastDate = false;
  let sunday = false;
  const date = parseDate(text, today);
  if (date) {
    if (date < today) pastDate = true;
    else if (weekdayOf(date) === 0) sunday = true;
    else d.date = date;
  }

  const time = parseTime(text, awaiting === "time");
  let oddTime = false;
  if (time === "other") oddTime = true;
  else if (time) d.time = time;

  // "Can I come now?": a walk-in. Use today and the earliest slot that is still open.
  let walkInNote = "";
  if (!date && !d.date && NOW_INTENT.test(text)) {
    if (weekdayOf(today) === 0) {
      walkInNote = "We're closed on Sundays, sorry! Which day from Monday would suit you?\n\n";
    } else {
      d.date = today;
      if (!d.mode) d.mode = "bring";
      const open = freeSlots(ledger, today);
      if (!d.time && open.length) {
        d.time = open[0];
        walkInNote = `Walk-ins are welcome 🙌 The earliest free slot today is ${open[0]}.\n\n`;
      } else if (!open.length) {
        d.date = null;
        walkInNote = "We're fully booked for the rest of today 😕 Which other day suits you?\n\n";
      }
    }
  }

  const scent = parseScent(text) ?? (awaiting === "scent" && NONE.test(text) ? "No scent" : null);
  if (scent) d.scent = scent;
  if (awaiting === "allergies") {
    d.allergies = NONE.test(text) ? "none" : /^\s*skip\s*$/i.test(text) ? "none" : text.slice(0, 200);
  } else if (/\b(allerg(y|ic|ies)|sensitiv(e|ity)|asthma|eczema|latex)\b/i.test(text) && !/\bno allergies\b/i.test(text)) {
    d.allergies = text.slice(0, 200);
  } else if (/\bno allergies\b/i.test(text)) {
    d.allergies = "none";
  }

  // 3. Special replies before moving on.
  const newly: string[] = [];
  if (d.vehicle && !was.vehicle) newly.push(`${d.make ? d.make + " " : ""}${d.vehicle === "suv" ? "SUV" : "sedan"}`);
  else if (d.make && !was.make) newly.push(d.make);
  if (d.mode && !was.mode) newly.push(MODE_LABEL[d.mode]);
  if (d.suburb && !was.suburb) newly.push(d.suburb);
  if (d.place && !was.place && d.mode !== "bring") newly.push(d.place);
  if (d.date && !was.date) newly.push(longDate(d.date));
  if (d.time && !was.time) newly.push(d.time);
  if (d.scent && !was.scent) newly.push(d.scent);
  if (d.allergies && !was.allergies) newly.push(d.allergies === "none" ? "no allergies" : "allergy noted");

  const nameHello = d.name && !was.name ? `Nice to meet you, ${d.name}! 👋\n\n` : "";
  const greeted = GREETING.test(text) && !d.name;
  const intro = greeted || ASKS_WHO.test(text)
    ? `${greeted ? "Hey! 👋 " : ""}I'm ${BOT} 🧽, ${(opts.businesses ?? []).find((b) => b.id === state.businessId)?.name ?? "WashSlot"}'s booking assistant (I'm a bot, but a friendly one!). Let's get your car sparkling ✨\n\n`
    : "";

  let notice = "";
  let slotTaken = false;
  if (pastDate) notice = "That date has already passed 😅 Which day would you like instead?\n\n";
  else if (sunday) notice = "We're closed on Sundays. Which other day suits you (Monday to Saturday)?\n\n";
  else if (oddTime) notice = `We work in set slots: ${SLOTS.join(", ")}. Which one would you like?\n\n`;
  if (d.mode && PLACE_NEEDED.includes(d.mode) && unservedPlace && !d.suburb) {
    d.mode = null;
    d.place = null;
    d.awaiting = "mode";
    return out(
      state, ledger,
      `${intro}Sorry, we don't collect or wash at home in ${unservedPlace} yet 😕 You're welcome to bring the car to our wash though!\n\nWould you like to do that?\n1️⃣ Yes, I'll bring it to your wash\nOr tell me another suburb we could come to 🙂`,
    );
  }

  // 4. Ask the next question, one at a time, or move on to the quote.
  if (pastDate || sunday) { d.date = null; if (d.awaiting === "date" || !d.date) d.awaiting = "date"; }
  // Date and time both known but that slot is full: say so now and ask for another time.
  if (d.date && d.time && (occupied(ledger.bookings, d.date, d.time) || isClosed(d.date, d.time))) {
    const free = freeSlots(ledger, d.date);
    const passed = isClosed(d.date, d.time) && !occupied(ledger.bookings, d.date, d.time);
    d.time = null;
    slotTaken = true;
    notice = free.length
      ? `${notice}${passed ? `That time has passed or is about to start (online booking closes ${CUTOFF_MIN} minutes before a slot)` : `${longDate(d.date)} at that time is already taken`} 😅 Free slots: ${free.join(", ")}.\n\n`
      : `${notice}${passed ? "There are no slots left to book online today" : `Every slot on ${longDate(d.date)} is taken`} 😅\n\n`;
    if (!free.length) d.date = null;
  }
  const next = nextField(d);
  if (next) {
    // A "yes"/"ok" that answers nothing: ask the question again rather than guess.
    d.awaiting = pastDate || sunday ? "date" : next;
    const q = question(d.awaiting, d, ledger);
    // A notice that already asks for a new day/time replaces the generic question and the recap.
    const asksAgain = pastDate || sunday || oddTime;
    const body = asksAgain ? notice.trimEnd() : slotTaken ? `${notice}${q}` : `${walkInNote}${notice}${recap(newly)}${q}`;
    return out(state, ledger, `${intro}${nameHello}${body}`);
  }

  // 5. Everything collected: ask the engine to price it and check the slot.
  d.awaiting = null;
  const request = `${d.vehicle} wash, ${
    d.mode === "bring" ? "I'll bring it to the wash bay" : `in ${d.suburb}`
  } at ${d.time} on ${d.date}.`;
  const r = handleEnquiry(ledger, request, null, null, null, d.name);
  state.offer = r.offer;
  state.detail = r.detail_check;
  let reply = friendlyReply({ message: request, draft: r.customer_draft.replace(/\s*This chat is the only message — nothing was sent outside it\./, ""), name: d.name });
  if (r.offer && r.status === "OFFERED") {
    const extras = [
      d.mode === "bring" ? null : `📍 ${d.mode === "collect" ? "Collect from" : "At"}: ${d.place}, ${d.suburb}`,
      d.mode === "bring" ? `📍 You bring it to ${pickBranch(undefined).name}` : null,
      `🚗 ${d.make} ${d.vehicle === "suv" ? "SUV" : "sedan"}`,
      `🌸 Scent: ${d.scent}`,
      `🧪 Allergies: ${d.allergies === "none" ? "none" : d.allergies}`,
    ].filter(Boolean).join("\n");
    reply = reply.replace("\n\nShall I lock it in?", `\n\n${extras}\n\nShall I lock it in?`);
    reply = reply.replace("Reply yes and it's yours", "Reply yes and it's yours");
  }
  return { reply, state, ledger: r.ledger, status: r.status, result: r };
}

function out(state: IntakeState, ledger: Ledger, reply: string): ConverseResult {
  return { reply, state, ledger, status: "NEEDS DETAILS", result: null };
}

/** Delegate to the engine (pending offer, repeated yes, returning customer, tampering). */
function viaEngine(ledger: Ledger, state: IntakeState, text: string, profileName: string | null): ConverseResult {
  const d = state.draft;
  const r = handleEnquiry(ledger, text, state.offer, state.detail, state.lastBooking, d.name ?? profileName);
  state.offer = r.offer;
  state.detail = r.detail_check;
  if (r.booking) {
    const fresh = r.booking.booking_id !== state.lastBooking?.booking_id;
    state.lastBooking = r.booking;
    if (fresh) {
      // Attach what the client told us, then re-issue the ticket for their mode.
      const row = r.ledger.bookings.find((b) => b.booking_id === r.booking!.booking_id) ?? r.booking;
      row.mode = d.mode ?? (row.suburb === WASH_BAY ? "bring" : "home");
      row.address = d.mode === "bring" ? undefined : d.place ?? undefined;
      row.make = d.make ?? undefined;
      row.scent = d.scent ?? undefined;
      row.allergies = d.allergies ?? undefined;
      r.booking = row;
      state.draft = { ...emptyDraft(), name: d.name };
    }
  }
  let plain = r.customer_draft.replace(/\s*This chat is the only message — nothing was sent outside it\./, "");
  if (r.booking && /^Booked B\d+:/.test(plain)) {
    plain = plain.replace(/\s*Your car is number[\s\S]*$/, "") + ` ${ticketFor(r.booking)}`;
  }
  const first = (r.offer?.demo_name ?? r.booking?.demo_name ?? d.name)?.split(/\s+/)[0] ?? null;
  const reply = friendlyReply({ message: text, draft: plain, name: first });
  return { reply, state, ledger: r.ledger, status: r.status, result: r };
}


const NUMBER_EMOJI = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];

function listBusinesses(state: IntakeState, found: (Nearby | (ReturnType<typeof byText>[number] & { km?: number }))[], lead: string): string {
  state.choices = found.map((b) => b.id);
  const lines = found.map(
    (b, i) => `${NUMBER_EMOJI[i]} ${b.name} · ${b.address.split(",")[0]}${"km" in b && b.km !== undefined ? ` · ${b.km.toFixed(1)} km away` : ""}`,
  );
  return `${lead}\n\n${lines.join("\n")}\n\nReply with a number to choose, or send a different location pin 📍`;
}

/** First step when more than one car wash is registered: location pin, suburb or number. */
function chooseBusiness(
  ledger: Ledger,
  state: IntakeState,
  text: string,
  loc: { lat: number; lng: number } | null,
  businesses: Business[],
): ConverseResult {
  const greeted = GREETING.test(text);
  const hi = state.introduced
    ? ""
    : `${greeted ? "Hey! 👋 " : ""}I'm ${BOT} 🧽 from WashSlot. I find a car wash near you and book it for you.\n\n`;
  state.introduced = true;

  const pick = state.choices.length ? text.trim().match(/^([1-9])\b/) : null;
  const byId = (id: string | undefined) => businesses.find((b) => b.id === id);
  let chosen = pick ? byId(state.choices[+pick[1] - 1]) : undefined;
  if (!chosen && state.choices.length) {
    chosen = state.choices.map((id) => byId(id)).find((b) => b && text.toLowerCase().includes(b.name.toLowerCase()));
  }
  if (chosen) {
    state.businessId = chosen.id;
    state.choices = [];
    state.draft.awaiting = "name";
    return out(
      state, ledger,
      `Great choice! 🙌 ${chosen.name} (${chosen.address}). I'll take your booking for them.\n\n${question("name", state.draft, ledger)}`,
    );
  }
  if (loc) {
    const found = nearest(businesses, loc.lat, loc.lng, 3);
    if (found.length) return out(state, ledger, listBusinesses(state, found, `${hi}Thanks for the pin 📍 These are the car washes closest to you:`));
  }
  const area = text.replace(GREETING, "").trim();
  if (/[a-z]{4}/i.test(area)) {
    const found = byText(businesses, area, 3);
    return out(state, ledger, listBusinesses(state, found, `${hi}Here are the car washes registered with us:`));
  }
  return out(
    state, ledger,
    `${hi}Please share your location pin 📍 (tap the + or paperclip, then Location) and I'll show you the nearest washes. Or just type your suburb.`,
  );
}
