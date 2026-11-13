import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Droplets } from "lucide-react";

export const Route = createFileRoute("/live")({ component: Live });

type Msg = { role: "customer" | "assistant"; text: string; at: string; status?: string };
type State = {
  bookings: {
    booking_id: string;
    demo_name: string;
    suburb: string;
    date_sast: string;
    start_time_sast: string;
    total_zar: number;
    status: string;
  }[];
  conversations: { sender: string; thread: Msg[] }[];
};

const SLOTS = ["09:00", "11:00", "13:00", "15:00"];

function pillClass(status?: string) {
  if (status === "CONFIRMED") return "status-confirmed";
  if (status === "PENDING OWNER REVIEW") return "status-pending";
  if (status === "OFFERED") return "status-offered";
  return "status-needs";
}

function Live() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/live-state", { cache: "no-store" });
        const data = (await res.json()) as State;
        if (alive) {
          setState(data);
          setError(false);
        }
      } catch {
        if (alive) setError(true);
      }
    };
    void tick();
    const id = setInterval(tick, 1500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const confirmed = (state?.bookings ?? []).filter((b) => b.status === "CONFIRMED");

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-5 px-4 py-4 md:gap-6 md:px-8 md:py-6">
      <header className="wave-header rounded-[var(--radius-card)] px-5 py-6 md:px-8">
        <p className="relative flex items-center gap-2 text-sm font-semibold tracking-wide text-[#c4f3ff] uppercase">
          <Droplets className="size-4" aria-hidden="true" />
          Johannesburg · fictional demo · live WhatsApp
        </p>
        <h1 className="relative font-display text-4xl font-semibold text-white md:text-5xl">WashSlot Live</h1>
        <p className="relative mt-1 text-[#e3fbff]">
          Message the WashSlot WhatsApp number. Replies and bookings appear here as they happen.
          {error && " (reconnecting…)"}
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <div className="glass-card flex min-h-[28rem] flex-col rounded-[var(--radius-card)]">
          <div className="border-b border-line px-4 py-3 text-sm font-semibold">WhatsApp conversations</div>
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
            {!state || state.conversations.length === 0 ? (
              <p className="text-muted">Waiting for the first WhatsApp message…</p>
            ) : (
              state.conversations.map((c) => (
                <div key={c.sender} className="flex flex-col gap-2 rounded-2xl bg-[#e7f0e9] p-3">
                  <p className="text-xs font-semibold tracking-wide text-muted uppercase">Customer {c.sender}</p>
                  {c.thread.map((m, i) => (
                    <div
                      key={i}
                      className={
                        m.role === "customer"
                          ? "mr-10 self-start rounded-2xl rounded-tl-md bg-white px-3 py-2 text-ink shadow-sm"
                          : "ml-10 self-end rounded-2xl rounded-tr-md bg-[#d5f5d0] px-3 py-2 text-ink shadow-sm"
                      }
                    >
                      <p>{m.text}</p>
                      {m.status && <span className={`status-pill mt-1 ${pillClass(m.status)}`}>{m.status}</span>}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="glass-card rounded-[var(--radius-card)] p-4">
            <h2 className="font-display text-xl">14 November 2026</h2>
            <ul className="mt-3 grid grid-cols-2 gap-3">
              {SLOTS.map((time) => {
                const hit = confirmed.find((b) => b.date_sast === "2026-11-14" && b.start_time_sast === time);
                return (
                  <li key={time} className={`slot-tile ${hit ? "slot-booked" : "slot-free"}`}>
                    <span className="relative text-lg font-bold">{time}</span>
                    <span className="relative text-sm font-semibold">
                      {hit ? `${hit.booking_id} · ${hit.suburb}` : "Free"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="glass-card rounded-[var(--radius-card)] p-4 text-sm">
            <h2 className="font-display text-xl">Book</h2>
            <ul className="mt-2 flex flex-col gap-2">
              {(state?.bookings ?? []).map((b) => (
                <li key={b.booking_id}>
                  <span className="font-semibold">{b.booking_id}</span> {b.demo_name} · {b.suburb} · {b.date_sast}{" "}
                  {b.start_time_sast} · R{b.total_zar}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>
    </main>
  );
}
