/**
 * Server-side state for the WhatsApp demo: ONE shared booking book (so two phones
 * really compete for slots) plus a per-sender conversation (pending offer, thread).
 *
 * In-memory on globalThis: fine for a single long-lived process (the laptop demo).
 * On serverless hosting, instances can be recycled, so state may reset between messages.
 */
import { seedLedger, type AgentResult, type Ledger } from "./engine.ts";
import { converse, emptyState, type IntakeState } from "./intake.ts";

export type ThreadMessage = { role: "customer" | "assistant"; text: string; at: string; status?: string };

type Convo = IntakeState & { thread: ThreadMessage[] };

type Store = { ledger: Ledger; convos: Map<string, Convo> };

const KEY = "__washslot_whatsapp_store__";
const g = globalThis as unknown as Record<string, Store | undefined>;

function store(): Store {
  return (g[KEY] ??= { ledger: seedLedger(), convos: new Map() });
}

export function resetStore(): void {
  g[KEY] = { ledger: seedLedger(), convos: new Map() };
}

/**
 * Turn a WhatsApp profile name into a safe booking name: first name only (the booking book is shown on the
 * public /live page), letters/space/'/- only, capped at 30 chars. Returns null when nothing usable is left.
 */
export function cleanProfileName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const first = raw.normalize("NFKC").trim().split(/\s+/)[0] ?? "";
  const cleaned = first.replace(/[^\p{L}'’-]/gu, "").slice(0, 30);
  return cleaned.length >= 2 ? cleaned : null;
}

/** Process one inbound WhatsApp message: remembered, one question at a time, engine does the pricing and booking. */
export function processMessage(
  from: string,
  body: string,
  profileName: string | null = null,
): { reply: string; result: AgentResult | null } {
  const s = store();
  const convo: Convo = s.convos.get(from) ?? { ...emptyState(), thread: [] };
  const r = converse(s.ledger, convo, body, { profileName: cleanProfileName(profileName) });
  s.ledger = r.ledger;
  convo.draft = r.state.draft;
  convo.offer = r.state.offer;
  convo.detail = r.state.detail;
  convo.lastBooking = r.state.lastBooking;
  const now = new Date().toISOString();
  convo.thread.push({ role: "customer", text: body, at: now });
  convo.thread.push({ role: "assistant", text: r.reply, at: now, status: r.status });
  s.convos.set(from, convo);
  return { reply: r.reply, result: r.result };
}

/** Snapshot for the /live page. Phone numbers are masked to the last 4 digits. */
export function snapshot() {
  const s = store();
  const mask = (n: string) => `…${n.replace(/\D/g, "").slice(-4)}`;
  return {
    bookings: s.ledger.bookings,
    bookingsReadable: s.ledger.bookingsReadable,
    conversations: [...s.convos.entries()].map(([from, c]) => ({ sender: mask(from), thread: c.thread })),
    updatedAt: new Date().toISOString(),
  };
}
