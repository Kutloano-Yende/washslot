/**
 * Server-side state for the WhatsApp demo: ONE shared booking book (so two phones
 * really compete for slots) plus a per-sender conversation (pending offer, thread).
 *
 * In-memory on globalThis: fine for a single long-lived process (the laptop demo).
 * On serverless hosting, instances can be recycled, so state may reset between messages.
 */
import { handleEnquiry, seedLedger, type AgentResult, type Booking, type Ledger, type Offer } from "./engine.ts";
import { friendlyReply } from "./friendly.ts";

export type ThreadMessage = { role: "customer" | "assistant"; text: string; at: string; status?: string };

type Convo = {
  offer: Offer | null;
  detail: Offer | null;
  lastBooking: Booking | null;
  thread: ThreadMessage[];
};

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

/** Process one inbound WhatsApp message through the same engine the web demo uses. */
export function processMessage(
  from: string,
  body: string,
  profileName: string | null = null,
): { reply: string; result: AgentResult } {
  const s = store();
  const convo = s.convos.get(from) ?? { offer: null, detail: null, lastBooking: null, thread: [] };
  const result = handleEnquiry(
    s.ledger,
    body,
    convo.offer,
    convo.detail,
    convo.lastBooking,
    cleanProfileName(profileName),
  );
  s.ledger = result.ledger;
  convo.offer = result.offer;
  convo.detail = result.detail_check;
  if (result.booking) convo.lastBooking = result.booking;
  // The web demo says "nothing was sent outside this chat"; over real WhatsApp that line is wrong.
  const plain = result.customer_draft.replace(/\s*This chat is the only message — nothing was sent outside it\./, "");
  // Warm, human tone for WhatsApp. Facts (prices, slots, IDs) are copied from `plain`, never re-generated.
  const firstName = (result.offer?.demo_name ?? result.booking?.demo_name ?? cleanProfileName(profileName))
    ?.split(/\s+/)[0] ?? null;
  const reply = friendlyReply({ message: body, draft: plain, name: firstName });
  const now = new Date().toISOString();
  convo.thread.push({ role: "customer", text: body, at: now });
  convo.thread.push({ role: "assistant", text: reply, at: now, status: result.status });
  s.convos.set(from, convo);
  return { reply, result };
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
