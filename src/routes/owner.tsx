import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Droplets, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/owner")({ component: Owner });

type Msg = { role: "customer" | "assistant"; text: string; at: string; status?: string };
type Convo = {
  sender: string;
  stage: "choosing a wash" | "answering questions" | "waiting for yes" | "booked";
  waitingOn: string | null;
  collected: { label: string; value: string }[];
  offer: { total: number; when: string; where: string } | null;
  startedAt: string;
  updatedAt: string;
  thread: Msg[];
};
type Booking = {
  booking_id: string;
  demo_name: string;
  suburb: string;
  date_sast: string;
  start_time_sast: string;
  end_time_sast: string;
  total_zar: number;
  staff?: string[];
  queue_number?: number;
  mode?: "bring" | "collect" | "home";
  walk_in?: boolean;
  address?: string;
  make?: string;
  scent?: string;
  allergies?: string;
};
type State = {
  business: { id: string; name: string; address: string; status: string; example: boolean; staff: string[]; phone: string };
  conversations: Convo[];
  bookings: Booking[];
};
type Platform = { businesses: { id: string; name: string; address: string; example: boolean }[] };

const SLOTS = ["09:00", "11:00", "13:00", "15:00"];
const STAGE_CLASS: Record<Convo["stage"], string> = {
  "choosing a wash": "status-needs",
  "answering questions": "status-needs",
  "waiting for yes": "status-offered",
  booked: "status-confirmed",
};
const MODE_LABEL = { bring: "Brings the car", collect: "We collect it", home: "Crew at their home" } as const;
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" });
const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

function Owner() {
  const [params, setParams] = useState<{ biz: string; key: string } | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [denied, setDenied] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [day, setDay] = useState<string>("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Walk-in or release. The dashboard refreshes itself within a couple of seconds. */
  async function act(body: Record<string, unknown>): Promise<boolean> {
    if (!params) return false;
    setBusy(true);
    const res = await fetch("/api/owner-action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ biz: params.biz, key: params.key, ...body }),
    }).catch(() => null);
    setBusy(false);
    const data = (await res?.json().catch(() => null)) as { ok: boolean; message?: string; error?: string } | null;
    setNotice({ ok: !!data?.ok, text: data?.message ?? data?.error ?? "Could not reach the server. Try again." });
    return !!data?.ok;
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setParams({ biz: q.get("biz") ?? "", key: q.get("key") ?? "" });
  }, []);

  useEffect(() => {
    if (!params) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/owner-state?biz=${encodeURIComponent(params.biz)}&key=${encodeURIComponent(params.key)}`, { cache: "no-store" });
        if (!alive) return;
        if (res.status === 403) return setDenied(true);
        setState((await res.json()) as State);
        setDenied(false);
        const p = await fetch("/api/platform", { cache: "no-store" });
        if (alive && p.ok) setPlatform((await p.json()) as Platform);
      } catch {
        /* keep the last good data on screen */
      }
    };
    void tick();
    const id = setInterval(tick, 1500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [params]);

  const dates = useMemo(
    () => [...new Set((state?.bookings ?? []).map((b) => b.date_sast))].sort(),
    [state?.bookings],
  );
  const activeDay = day || dates.find((d) => d >= new Date().toISOString().slice(0, 10)) || dates[0] || "";
  const sorted = useMemo(
    () => [...(state?.bookings ?? [])].sort((a, b) => a.date_sast.localeCompare(b.date_sast) || a.start_time_sast.localeCompare(b.start_time_sast)),
    [state?.bookings],
  );
  const live = state?.conversations.filter((c) => c.stage !== "booked") ?? [];
  const waiting = state?.conversations.filter((c) => c.stage === "waiting for yes").length ?? 0;

  if (denied || (params && !params.biz)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-3 px-4 py-10">
        <h1 className="font-display text-3xl font-semibold">This dashboard link isn’t valid</h1>
        <p className="text-muted">
          Open the private link you were given when you registered. It contains your business ID and key. New here?{" "}
          <a className="font-semibold text-accent underline" href="/register">Register your car wash</a>.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-5 px-4 py-4 md:gap-6 md:px-8 md:py-6">
      <header className="wave-header rounded-[var(--radius-card)] px-5 py-6 md:px-8">
        <p className="relative flex items-center gap-2 text-sm font-semibold tracking-wide text-[#c4f3ff] uppercase">
          <Droplets className="size-4" aria-hidden="true" /> Owner dashboard
          {state?.business.example ? " · sample business" : ""}
        </p>
        <h1 className="relative font-display text-3xl font-semibold text-white md:text-5xl">{state?.business.name ?? "Loading…"}</h1>
        <p className="relative mt-1 text-[#e3fbff]">{state?.business.address}</p>
        {state && state.business.status !== "approved" && (
          <p className="relative mt-3 inline-block rounded-full bg-[#fff0e4] px-4 py-1 text-sm font-bold text-[#9a3412]">
            Waiting for approval: clients can’t see your wash yet
          </p>
        )}
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Summary">
        {[
          ["Live conversations", live.length],
          ["Waiting for a yes", waiting],
          ["Bookings", sorted.length],
          ["Employees", state?.business.staff.length ?? 0],
        ].map(([label, n]) => (
          <div key={String(label)} className="glass-card rounded-[var(--radius-card)] p-4">
            <p className="text-sm font-semibold text-muted">{label}</p>
            <p className="font-display text-3xl font-semibold">{n}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <div className="glass-card flex flex-col gap-3 rounded-[var(--radius-card)] p-4">
          <h2 className="font-display text-xl">Conversations</h2>
          {!state?.conversations.length ? (
            <p className="text-muted">No conversations yet. When a client messages and chooses your wash, the chat appears here live.</p>
          ) : (
            state.conversations.map((c) => (
              <article key={c.sender} className="rounded-2xl border border-line bg-white/70 p-3">
                <button
                  type="button"
                  className="flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 text-left"
                  onClick={() => setOpen(open === c.sender ? null : c.sender)}
                  aria-expanded={open === c.sender}
                >
                  <MessageCircle className="size-4 text-accent" aria-hidden="true" />
                  <span className="font-semibold">
                    {c.collected.find((x) => x.label === "Name")?.value ?? "New client"} · {c.sender}
                  </span>
                  <span className={`status-pill ${STAGE_CLASS[c.stage]}`}>{c.stage}</span>
                  <span className="ml-auto text-sm text-muted">{clock(c.updatedAt)}</span>
                </button>
                {c.waitingOn && c.stage !== "booked" && (
                  <p className="mt-1 text-sm text-muted">Agent is waiting for: <b>{c.waitingOn}</b></p>
                )}
                {c.offer && (
                  <p className="mt-1 text-sm">
                    Offer out: <b>R{c.offer.total}</b> · {c.offer.when} · {c.offer.where}
                  </p>
                )}
                {c.collected.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {c.collected.map((x) => (
                      <li key={x.label} className="rounded-full border border-line bg-cyan-soft/60 px-3 py-1 text-sm">
                        <span className="text-muted">{x.label}: </span>
                        {x.value}
                      </li>
                    ))}
                  </ul>
                )}
                {open === c.sender && (
                  <div className="mt-3 flex flex-col gap-2 rounded-2xl bg-[#e7f0e9] p-3">
                    {c.thread.map((m, i) => (
                      <div
                        key={i}
                        className={
                          m.role === "customer"
                            ? "mr-8 self-start rounded-2xl rounded-tl-md bg-white px-3 py-2 shadow-sm"
                            : "ml-8 self-end whitespace-pre-line rounded-2xl rounded-tr-md bg-[#d5f5d0] px-3 py-2 shadow-sm"
                        }
                      >
                        {m.text}
                        <span className="mt-1 block text-xs text-muted">{clock(m.at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <form
            className="glass-card flex flex-col gap-3 rounded-[var(--radius-card)] p-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              if (await act({ action: "walkin", name: f.get("name"), make: f.get("make"), vehicle: f.get("vehicle"), slot: f.get("slot") || undefined })) form.reset();
            }}
          >
            <h2 className="font-display text-xl">Add a walk-in</h2>
            <p className="text-sm text-muted">Someone drove in without booking. This puts two free employees on the job and takes the slot off online booking straight away.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input name="name" required minLength={2} maxLength={40} placeholder="Client name" aria-label="Client name" className="min-h-11 rounded-2xl border border-line bg-white px-3" />
              <input name="make" maxLength={30} placeholder="Car make (optional)" aria-label="Car make" className="min-h-11 rounded-2xl border border-line bg-white px-3" />
              <select name="vehicle" aria-label="Vehicle type" className="min-h-11 rounded-2xl border border-line bg-white px-3">
                <option value="sedan">Sedan</option>
                <option value="suv">SUV</option>
              </select>
              <select name="slot" aria-label="Slot" className="min-h-11 rounded-2xl border border-line bg-white px-3">
                <option value="">Earliest free slot</option>
                {SLOTS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={busy} className="min-h-11 rounded-full bg-accent px-5 font-semibold text-accent-ink disabled:opacity-60">
              Add walk-in
            </button>
            {notice && (
              <p role="status" className={`rounded-2xl px-3 py-2 text-sm font-semibold ${notice.ok ? "bg-[#e2f6e9] text-[#17683a]" : "bg-[#fff0e4] text-[#9a3412]"}`}>
                {notice.text}
              </p>
            )}
          </form>

          <div className="glass-card rounded-[var(--radius-card)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-xl">{activeDay ? longDate(activeDay) : "Day board"}</h2>
              {dates.length > 1 && (
                <select
                  aria-label="Day"
                  value={activeDay}
                  onChange={(e) => setDay(e.target.value)}
                  className="min-h-11 rounded-full border border-line bg-white px-3 text-sm"
                >
                  {dates.map((d) => (
                    <option key={d} value={d}>{longDate(d)}</option>
                  ))}
                </select>
              )}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-3">
              {SLOTS.map((time) => {
                const hits = sorted.filter((b) => b.date_sast === activeDay && b.start_time_sast === time);
                return (
                  <li key={time} className={`slot-tile ${hits.length ? "slot-booked" : "slot-free"}`}>
                    <span className="relative text-lg font-bold">{time}</span>
                    {hits.length ? (
                      hits.map((h) => (
                        <span key={h.booking_id} className="relative text-sm font-semibold">
                          {h.demo_name} · {h.staff?.join(" + ")}
                        </span>
                      ))
                    ) : (
                      <span className="relative text-sm font-semibold">Free</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="glass-card rounded-[var(--radius-card)] p-4">
            <h2 className="font-display text-xl">Who booked what</h2>
            {!sorted.length ? (
              <p className="mt-2 text-muted">No bookings yet.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-3">
                {sorted.map((b, i) => (
                  <li key={b.booking_id} className="rounded-2xl border border-line bg-white/70 p-3 text-sm">
                    <p className="font-semibold">
                      #{i + 1} {b.booking_id} · {b.demo_name} · R{b.total_zar}
                    </p>
                    <p>{longDate(b.date_sast)}, {b.start_time_sast}–{b.end_time_sast}</p>
                    <p className="text-muted">
                      {b.make ? `${b.make} · ` : ""}
                      {b.mode ? MODE_LABEL[b.mode] : b.suburb}
                      {b.address ? ` · ${b.address}, ${b.suburb}` : ""}
                    </p>
                    <p>Team: <b>{b.staff?.join(" + ") ?? "not assigned"}</b>{b.walk_in ? " · walk-in" : ""}</p>
                    {releasing === b.booking_id ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="font-semibold">Release this slot?</span>
                        <button type="button" disabled={busy} onClick={async () => { await act({ action: "release", bookingId: b.booking_id }); setReleasing(null); }} className="min-h-11 rounded-full bg-[#9a3412] px-4 font-semibold text-white">Yes, release</button>
                        <button type="button" onClick={() => setReleasing(null)} className="min-h-11 rounded-full border border-line bg-white px-4 font-semibold">Keep</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setReleasing(b.booking_id)} className="mt-2 min-h-11 rounded-full border border-line bg-white px-4 font-semibold">
                        Client is late: release slot
                      </button>
                    )}
                    {(b.scent || b.allergies) && (
                      <p className="text-muted">
                        {b.scent ? `Scent: ${b.scent}` : ""}
                        {b.allergies && b.allergies !== "none" ? ` · Allergy: ${b.allergies}` : ""}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="glass-card rounded-[var(--radius-card)] p-4 text-sm">
            <h2 className="font-display text-xl">Car washes on WashSlot</h2>
            <ul className="mt-2 flex flex-col gap-1">
              {(platform?.businesses ?? []).map((b) => (
                <li key={b.id}>
                  <b>{b.name}</b> · {b.address}
                  {b.id === state?.business.id ? " (you)" : ""}
                  {b.example ? " · sample" : ""}
                </li>
              ))}
            </ul>
            <a className="mt-3 inline-flex min-h-11 items-center font-semibold text-accent underline" href="/register">Register another wash</a>
          </div>
        </aside>
      </section>
    </main>
  );
}
