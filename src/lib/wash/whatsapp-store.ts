/**
 * Server-side state for the WhatsApp agent.
 *
 * - One booking book PER business (two phones booking the same wash really compete for slots).
 * - One conversation per sender: what the client has said so far, the pending offer, and the full thread.
 * - Before each message the engine is pointed at the right business's prices, areas and team.
 *
 * In-memory on globalThis: fine for a single long-lived process. A real deployment needs a database,
 * otherwise bookings and conversations are lost on restart (and on serverless instance recycling).
 */
import { emptyLedger, seedLedger, type AgentResult, type Ledger } from "./engine.ts";
import { DEMO_ID, activateBusiness, getBusiness, listBusinesses, publicView } from "./businesses.ts";
import { converse, emptyState, type Draft, type IntakeState } from "./intake.ts";

export type ThreadMessage = { role: "customer" | "assistant"; text: string; at: string; status?: string };

type Convo = IntakeState & { thread: ThreadMessage[]; startedAt: string };

type Store = { ledgers: Map<string, Ledger>; convos: Map<string, Convo> };

const KEY = "__washslot_whatsapp_store__";
const g = globalThis as unknown as Record<string, Store | undefined>;

function store(): Store {
  return (g[KEY] ??= { ledgers: new Map(), convos: new Map() });
}

export function resetStore(): void {
  g[KEY] = { ledgers: new Map(), convos: new Map() };
}

function ledgerOf(businessId: string): Ledger {
  const s = store();
  let l = s.ledgers.get(businessId);
  if (!l) {
    l = businessId === DEMO_ID ? seedLedger() : emptyLedger();
    s.ledgers.set(businessId, l);
  }
  return l;
}

/**
 * Turn a WhatsApp profile name into a safe booking name: first name only, letters/space/'/- only, capped at
 * 30 chars. Returns null when nothing usable is left.
 */
export function cleanProfileName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const first = raw.normalize("NFKC").trim().split(/\s+/)[0] ?? "";
  const cleaned = first.replace(/[^\p{L}'’-]/gu, "").slice(0, 30);
  return cleaned.length >= 2 ? cleaned : null;
}

/** New clients start by choosing a wash when several are registered; with a single wash they go straight in. */
function newConvo(): Convo {
  const approved = listBusinesses({ approvedOnly: true });
  const businessId = approved.length > 1 ? null : (approved[0]?.id ?? DEMO_ID);
  return { ...emptyState(businessId), thread: [], startedAt: new Date().toISOString() };
}

export type Pin = { lat: number; lng: number };

/** Process one inbound WhatsApp message: remembered, one question at a time, engine prices and books. */
export function processMessage(
  from: string,
  body: string,
  profileName: string | null = null,
  location: Pin | null = null,
): { reply: string; result: AgentResult | null } {
  const s = store();
  const convo: Convo = s.convos.get(from) ?? newConvo();
  const before = convo.businessId;
  activateBusiness(before);
  const ledger = ledgerOf(before ?? DEMO_ID);
  const r = converse(ledger, convo, body, { profileName: cleanProfileName(profileName), location });
  // Only keep the ledger when the booking was made with the business we started with.
  if (before) s.ledgers.set(before, r.ledger);
  convo.draft = r.state.draft;
  convo.offer = r.state.offer;
  convo.detail = r.state.detail;
  convo.lastBooking = r.state.lastBooking;
  convo.businessId = r.state.businessId;
  convo.choices = r.state.choices;
  convo.introduced = r.state.introduced;
  const now = new Date().toISOString();
  convo.thread.push({ role: "customer", text: body || (location ? "📍 Shared a location pin" : ""), at: now });
  convo.thread.push({ role: "assistant", text: r.reply, at: now, status: r.status });
  s.convos.set(from, convo);
  return { reply: r.reply, result: r.result };
}

const mask = (n: string) => `…${n.replace(/\D/g, "").slice(-4)}`;

type Stage = "choosing a wash" | "answering questions" | "waiting for yes" | "booked";

function stageOf(c: Convo): { stage: Stage; waitingOn: string | null } {
  if (!c.businessId) return { stage: "choosing a wash", waitingOn: null };
  if (c.offer) return { stage: "waiting for yes", waitingOn: "the client's yes" };
  const d = c.draft;
  const started = Object.entries(d).some(([k, v]) => k !== "awaiting" && k !== "name" && v);
  if (c.lastBooking && !started) return { stage: "booked", waitingOn: null };
  return { stage: "answering questions", waitingOn: d.awaiting };
}

/** What the client has told us so far, as short labels the owner can scan. */
function collected(d: Draft): { label: string; value: string }[] {
  const rows: [string, string | null][] = [
    ["Name", d.name],
    ["How", d.mode === "bring" ? "Brings the car" : d.mode === "collect" ? "We collect it" : d.mode === "home" ? "Crew at their home" : null],
    ["Suburb", d.suburb],
    ["Address", d.place],
    ["Car", [d.make, d.vehicle === "suv" ? "SUV" : d.vehicle].filter(Boolean).join(" ") || null],
    ["Day", d.date],
    ["Time", d.time],
    ["Scent", d.scent],
    ["Allergies", d.allergies],
  ];
  return rows.filter((r): r is [string, string] => !!r[1]).map(([label, value]) => ({ label, value }));
}

/** Public demo view for the presenter page: the sample business and the pre-selection chats. */
export function snapshot() {
  const s = store();
  const ledger = ledgerOf(DEMO_ID);
  return {
    bookings: ledger.bookings,
    bookingsReadable: ledger.bookingsReadable,
    conversations: [...s.convos.entries()]
      .filter(([, c]) => c.businessId === null || c.businessId === DEMO_ID)
      .map(([from, c]) => ({ sender: mask(from), thread: c.thread })),
    updatedAt: new Date().toISOString(),
  };
}

/** Everything one owner needs: live conversations, who has booked what, and the team. Needs the owner's key. */
export function ownerSnapshot(businessId: string, key: string) {
  const b = getBusiness(businessId);
  if (!b || b.key !== key) return null;
  const s = store();
  const convos = [...s.convos.entries()]
    .filter(([, c]) => c.businessId === businessId)
    .map(([from, c]) => {
      const { stage, waitingOn } = stageOf(c);
      const last = c.thread[c.thread.length - 1];
      return {
        sender: mask(from),
        stage,
        waitingOn,
        collected: collected(c.draft),
        offer: c.offer
          ? { total: c.offer.total_zar, when: `${c.offer.date_sast} ${c.offer.start_time_sast}`, where: c.offer.zone.suburb }
          : null,
        startedAt: c.startedAt,
        updatedAt: last?.at ?? c.startedAt,
        thread: c.thread,
      };
    })
    .sort((a, z) => z.updatedAt.localeCompare(a.updatedAt));
  const ledger = ledgerOf(businessId);
  return {
    business: {
      ...publicView(b),
      phone: b.phone,
      staff: b.staff.map((x) => x.name),
      prices: b.services.map((x) => ({ vehicle: x.vehicle_type, zar: x.base_price_zar })),
    },
    conversations: convos,
    bookings: ledger.bookings,
    updatedAt: new Date().toISOString(),
  };
}
