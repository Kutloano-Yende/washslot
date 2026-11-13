/**
 * Where the platform's data lives.
 *
 *  - "sql":    Postgres (Supabase) when DATABASE_URL is set, or the embedded Postgres when WASHSLOT_STORE=pglite.
 *              Bookings, conversations and businesses survive restarts and are shared by every server instance.
 *  - "memory": the fallback with no database configured (tests, quick demos). Lost on restart.
 *
 * Booking books are updated with optimistic concurrency (a version number): if two messages try to book at the
 * same moment, the loser re-reads the fresh book and re-runs, so a slot can never be given to two people.
 * Client phone numbers are never stored, only a salted hash and the last four digits.
 */
import { createHash } from "node:crypto";
import { emptyLedger, seedLedger, type Ledger } from "./engine.ts";
import { seedBusinesses } from "./businesses.ts";
import { DEMO_ID, type Business } from "./seeds.ts";
import type { IntakeState } from "./intake.ts";

export type ThreadMessage = { role: "customer" | "assistant"; text: string; at: string; status?: string };
export type StoredConvo = IntakeState & { thread: ThreadMessage[]; startedAt: string };
export type ConvoRow = { hash: string; last4: string; convo: StoredConvo };

export interface Repo {
  readonly kind: "memory" | "sql";
  listBusinesses(): Promise<Business[]>;
  getBusiness(id: string): Promise<Business | undefined>;
  addBusiness(b: Business): Promise<void>;
  approveBusiness(id: string): Promise<Business | undefined>;
  readLedger(businessId: string): Promise<Ledger>;
  /** Atomic read-modify-write of one business's booking book. `fn` may run more than once, so keep it free of side effects. */
  updateLedger<T>(businessId: string, fn: (ledger: Ledger) => { ledger: Ledger; out: T }): Promise<T>;
  getConvo(hash: string): Promise<StoredConvo | undefined>;
  saveConvo(hash: string, last4: string, convo: StoredConvo): Promise<void>;
  /** Conversations of one business, newest first. `null` lists the ones still choosing a wash. */
  listConvos(businessId: string | null): Promise<ConvoRow[]>;
  /** Clear bookings and conversations (not the businesses). Used between rehearsals. */
  reset(): Promise<void>;
}

const defaultLedger = (businessId: string): Ledger => (businessId === DEMO_ID ? seedLedger() : emptyLedger());
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Salted hash of a WhatsApp number: stable per client, useless to anyone who reads the database. */
export function hashSender(from: string): string {
  const salt = process.env.SENDER_SALT ?? process.env.WHATSAPP_WEBHOOK_KEY ?? "washslot";
  return createHash("sha256").update(`${salt}:${from}`).digest("hex");
}

// ---------------------------------------------------------------- memory

type Mem = { businesses: Business[]; ledgers: Map<string, Ledger>; convos: Map<string, ConvoRow & { businessId: string | null; at: string }> };
const MEM = "__washslot_repo_memory__";
const gm = globalThis as unknown as Record<string, Mem | undefined>;
const mem = (): Mem => (gm[MEM] ??= { businesses: seedBusinesses(), ledgers: new Map(), convos: new Map() });

const memoryRepo: Repo = {
  kind: "memory",
  async listBusinesses() {
    return mem().businesses;
  },
  async getBusiness(id) {
    return mem().businesses.find((b) => b.id === id);
  },
  async addBusiness(b) {
    mem().businesses.push({ ...b, key: undefined });
  },
  async approveBusiness(id) {
    const b = mem().businesses.find((x) => x.id === id);
    if (b) b.status = "approved";
    return b;
  },
  async readLedger(id) {
    const m = mem();
    if (!m.ledgers.has(id)) m.ledgers.set(id, defaultLedger(id));
    return m.ledgers.get(id)!;
  },
  async updateLedger(id, fn) {
    const m = mem();
    const cur = m.ledgers.get(id) ?? defaultLedger(id);
    const { ledger, out } = fn(cur);
    m.ledgers.set(id, ledger);
    return out;
  },
  async getConvo(hash) {
    return mem().convos.get(hash)?.convo;
  },
  async saveConvo(hash, last4, convo) {
    mem().convos.set(hash, { hash, last4, convo, businessId: convo.businessId, at: new Date().toISOString() });
  },
  async listConvos(businessId) {
    return [...mem().convos.values()]
      .filter((c) => c.businessId === businessId)
      .sort((a, b) => b.at.localeCompare(a.at))
      .map(({ hash, last4, convo }) => ({ hash, last4, convo }));
  },
  async reset() {
    const m = mem();
    m.ledgers.clear();
    m.convos.clear();
  },
};

// ---------------------------------------------------------------- sql (Supabase / embedded Postgres)

async function makeSqlRepo(): Promise<Repo> {
  const { getSql, ensureDbReady } = await import("../db.ts");
  await ensureDbReady();
  const sql = await getSql();
  const q = <T = Record<string, unknown>>(text: string, params: unknown[] = []) => sql.query<T>(text, params);
  const json = (x: unknown) => JSON.stringify(x);

  const toBusiness = (r: { doc: Business; key_hash: string; status: "pending" | "approved" }): Business => ({
    ...r.doc,
    keyHash: r.key_hash,
    status: r.status,
  });
  const strip = (b: Business) => {
    const { key: _key, keyHash: _hash, status: _status, ...doc } = b;
    return doc;
  };

  async function listBusinesses(): Promise<Business[]> {
    let rows = await q<{ doc: Business; key_hash: string; status: "pending" | "approved" }>(
      "select doc, key_hash, status from businesses order by created_at, id",
    );
    if (!rows.length) {
      for (const b of seedBusinesses()) {
        await q(
          "insert into businesses (id, doc, key_hash, status) values ($1, $2::jsonb, $3, $4) on conflict (id) do nothing",
          [b.id, json(strip(b)), b.keyHash, b.status],
        );
      }
      rows = await q("select doc, key_hash, status from businesses order by created_at, id");
    }
    return rows.map(toBusiness);
  }

  async function readRow(id: string): Promise<{ doc: Ledger; version: number }> {
    await q("insert into ledgers (business_id, doc) values ($1, $2::jsonb) on conflict (business_id) do nothing", [
      id,
      json(defaultLedger(id)),
    ]);
    const [row] = await q<{ doc: Ledger; version: number }>("select doc, version from ledgers where business_id = $1", [id]);
    return row;
  }

  return {
    kind: "sql",
    listBusinesses,
    async getBusiness(id) {
      return (await listBusinesses()).find((b) => b.id === id);
    },
    async addBusiness(b) {
      await q("insert into businesses (id, doc, key_hash, status) values ($1, $2::jsonb, $3, $4)", [
        b.id,
        json(strip(b)),
        b.keyHash,
        b.status,
      ]);
    },
    async approveBusiness(id) {
      const rows = await q<{ doc: Business; key_hash: string; status: "pending" | "approved" }>(
        "update businesses set status = 'approved' where id = $1 returning doc, key_hash, status",
        [id],
      );
      return rows[0] ? toBusiness(rows[0]) : undefined;
    },
    async readLedger(id) {
      return (await readRow(id)).doc;
    },
    async updateLedger(id, fn) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const row = await readRow(id);
        const { ledger, out } = fn(clone(row.doc));
        const done = await q(
          "update ledgers set doc = $2::jsonb, version = version + 1, updated_at = now() where business_id = $1 and version = $3 returning version",
          [id, json(ledger), row.version],
        );
        if (done.length) return out;
      }
      throw new Error("The booking book is busy. Please try again in a moment.");
    },
    async getConvo(hash) {
      const rows = await q<{ doc: StoredConvo }>("select doc from conversations where sender_hash = $1", [hash]);
      return rows[0]?.doc;
    },
    async saveConvo(hash, last4, convo) {
      await q(
        `insert into conversations (sender_hash, last4, business_id, doc, updated_at)
         values ($1, $2, $3, $4::jsonb, now())
         on conflict (sender_hash) do update set business_id = excluded.business_id, doc = excluded.doc, updated_at = now()`,
        [hash, last4, convo.businessId, json(convo)],
      );
    },
    async listConvos(businessId) {
      const rows = await q<{ sender_hash: string; last4: string; doc: StoredConvo }>(
        "select sender_hash, last4, doc from conversations where business_id is not distinct from $1 order by updated_at desc limit 200",
        [businessId],
      );
      return rows.map((r) => ({ hash: r.sender_hash, last4: r.last4, convo: r.doc }));
    },
    async reset() {
      await q("truncate table ledgers, conversations");
    },
  };
}

// ---------------------------------------------------------------- selection

const REPO = "__washslot_repo__";
const gr = globalThis as unknown as Record<string, Promise<Repo> | undefined>;

/** The active repository (created once per process). */
export function getRepo(): Promise<Repo> {
  const wantsSql = !!process.env.DATABASE_URL?.trim() || process.env.WASHSLOT_STORE === "pglite";
  if (!wantsSql) return Promise.resolve(memoryRepo);
  gr[REPO] ??= makeSqlRepo().catch((e) => {
    gr[REPO] = undefined; // let the next call retry instead of caching a failure
    throw e;
  });
  return gr[REPO]!;
}

/** Test helper: forget everything, including the in-memory businesses. */
export function resetMemoryRepo(): void {
  gm[MEM] = undefined;
}
