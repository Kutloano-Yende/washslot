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
import { addWalkIn, occupied, type AgentResult } from "./engine.ts";
import { DEMO_ID, createBusiness, hashKey, publicView, type RegisterInput } from "./businesses.ts";
import { converse, emptyState, minutesNowSAST, todayISO, type Draft } from "./intake.ts";
import { getRepo, hashSender, type StoredConvo, type ThreadMessage } from "./repo.ts";
import { SLOTS, activate, type Business, type Slot } from "./seeds.ts";

export type { ThreadMessage };

export async function resetStore(): Promise<void> {
  await (await getRepo()).reset();
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
function newConvo(businesses: Business[]): StoredConvo {
  const approved = businesses.filter((b) => b.status === "approved");
  const businessId = approved.length > 1 ? null : (approved[0]?.id ?? DEMO_ID);
  return { ...emptyState(businessId), thread: [], startedAt: new Date().toISOString() };
}

export type Pin = { lat: number; lng: number };

/** Process one inbound WhatsApp message: remembered, one question at a time, engine prices and books. */
export async function processMessage(
  from: string,
  body: string,
  profileName: string | null = null,
  location: Pin | null = null,
): Promise<{ reply: string; result: AgentResult | null }> {
  const repo = await getRepo();
  const hash = hashSender(from);
  const last4 = from.replace(/\D/g, "").slice(-4);
  const businesses = await repo.listBusinesses();
  const convo = (await repo.getConvo(hash)) ?? newConvo(businesses);
  const before = convo.businessId;
  const biz = businesses.find((b) => b.id === (before ?? DEMO_ID)) ?? businesses[0];
  const opts = { profileName: cleanProfileName(profileName), location, businesses };

  // The engine reads prices, areas and team from the active business, so switch it in the same synchronous
  // step as the call (nothing else can run in between).
  let r: ReturnType<typeof converse>;
  if (before) {
    r = await repo.updateLedger(biz.id, (ledger) => {
      activate(biz);
      const out = converse(ledger, convo, body, opts);
      return { ledger: out.ledger, out };
    });
  } else {
    const ledger = await repo.readLedger(biz.id);
    activate(biz);
    r = converse(ledger, convo, body, opts);
  }

  const next: StoredConvo = {
    ...convo,
    draft: r.state.draft,
    offer: r.state.offer,
    detail: r.state.detail,
    lastBooking: r.state.lastBooking,
    businessId: r.state.businessId,
    choices: r.state.choices,
    introduced: r.state.introduced,
    thread: [...convo.thread],
  };
  const now = new Date().toISOString();
  next.thread.push({ role: "customer", text: body || (location ? "📍 Shared a location pin" : ""), at: now });
  next.thread.push({ role: "assistant", text: r.reply, at: now, status: r.status });
  await repo.saveConvo(hash, last4, next);
  return { reply: r.reply, result: r.result };
}

/** Register a car wash. It starts pending. The reply carries the plain owner key once; only its hash is stored. */
export async function registerNewBusiness(input: RegisterInput): Promise<Business> {
  const repo = await getRepo();
  const b = createBusiness(input, await repo.listBusinesses());
  await repo.addBusiness(b);
  return b;
}

export async function approve(id: string): Promise<Business | undefined> {
  return (await getRepo()).approveBusiness(id);
}

export async function platformList() {
  return (await (await getRepo()).listBusinesses()).filter((b) => b.status === "approved").map(publicView);
}

export async function pendingList() {
  return (await (await getRepo()).listBusinesses()).filter((b) => b.status === "pending").map(publicView);
}

const mask = (last4: string) => `…${last4}`;

type Stage = "choosing a wash" | "answering questions" | "waiting for yes" | "booked";

function stageOf(c: StoredConvo): { stage: Stage; waitingOn: string | null } {
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
export async function snapshot() {
  const repo = await getRepo();
  const ledger = await repo.readLedger(DEMO_ID);
  const rows = [...(await repo.listConvos(DEMO_ID)), ...(await repo.listConvos(null))];
  return {
    bookings: ledger.bookings,
    bookingsReadable: ledger.bookingsReadable,
    conversations: rows.map((r) => ({ sender: mask(r.last4), thread: r.convo.thread })),
    updatedAt: new Date().toISOString(),
  };
}

/** Everything one owner needs: live conversations, who has booked what, and the team. Needs the owner's key. */
export async function ownerSnapshot(businessId: string, key: string) {
  const repo = await getRepo();
  const b = await repo.getBusiness(businessId);
  if (!b || b.keyHash !== hashKey(key)) return null;
  const convos = (await repo.listConvos(businessId))
    .map(({ last4, convo: c }) => {
      const { stage, waitingOn } = stageOf(c);
      const last = c.thread[c.thread.length - 1];
      return {
        sender: mask(last4),
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
  const ledger = await repo.readLedger(businessId);
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

export type OwnerAction =
  | { action: "walkin"; name: string; vehicle: "sedan" | "suv"; make?: string; slot?: string }
  | { action: "release"; bookingId: string };

export type OwnerActionResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Things an owner can do from the dashboard.
 *  - walkin:  a client arrived without booking. They take the earliest slot that is still running or ahead and
 *             has two free employees (or the slot the owner picks), so online availability updates at once.
 *  - release: a booked client is late or gone. The booking is removed and its employees are free again, so the
 *             slot can go to a walk-in at any hour.
 */
export async function ownerAction(businessId: string, key: string, a: OwnerAction): Promise<OwnerActionResult> {
  const repo = await getRepo();
  const biz = await repo.getBusiness(businessId);
  if (!biz || biz.keyHash !== hashKey(key)) return { ok: false, error: "Not allowed." };

  if (a.action === "release") {
    return repo.updateLedger<OwnerActionResult>(biz.id, (ledger) => {
      const row = ledger.bookings.find((b) => b.booking_id === a.bookingId);
      if (!row) return { ledger, out: { ok: false, error: "That booking was not found." } };
      const next = { ...ledger, bookings: ledger.bookings.filter((b) => b.booking_id !== row.booking_id) };
      return {
        ledger: next,
        out: {
          ok: true,
          message: `Released ${row.booking_id} (${row.demo_name}). ${row.staff?.join(" + ") ?? "The team"} ${row.staff ? "are" : "is"} free again.`,
        },
      };
    });
  }

  if (a.action === "walkin") {
    const name = String(a.name ?? "").trim();
    if (name.length < 2) return { ok: false, error: "Enter the client's name." };
    if (a.vehicle !== "sedan" && a.vehicle !== "suv") return { ok: false, error: "Choose sedan or SUV." };
    return repo.updateLedger<OwnerActionResult>(biz.id, (ledger) => {
      activate(biz);
      const date = todayISO();
      const nowMin = minutesNowSAST();
      // A slot still counts while its 90 minutes are running.
      const ahead = (s: string) => Number(s.slice(0, 2)) * 60 + 90 > nowMin;
      const free = (s: Slot) => !occupied(ledger.bookings, date, s);
      const picked = SLOTS.find((s) => s === a.slot);
      const slot = picked ?? SLOTS.find((s) => ahead(s) && free(s));
      if (!picked && !SLOTS.some(ahead)) {
        return { ledger, out: { ok: false, error: "Today's slots are all over. Pick a slot in the list if you still want to add one." } };
      }
      if (!slot || !free(slot)) {
        return { ledger, out: { ok: false, error: "No two employees are free for a walk-in right now." } };
      }
      const made = addWalkIn(ledger, { name, vehicle: a.vehicle, make: a.make, date, slot });
      if (!made) return { ledger, out: { ok: false, error: "No two employees are free for a walk-in right now." } };
      const b = made.booking;
      return {
        ledger: made.ledger,
        out: { ok: true, message: `Added ${b.booking_id} for ${b.demo_name} at ${b.start_time_sast} with ${b.staff?.join(" + ")}. R${b.total_zar}.` },
      };
    });
  }
  return { ok: false, error: "Unknown action." };
}
