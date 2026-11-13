import { createFileRoute } from "@tanstack/react-router";
import { Droplets, MapPin, MessageCircle, Users } from "lucide-react";
import { useMode } from "@/lib/use-mode";

export const Route = createFileRoute("/")({ component: Landing });

const STEPS = [
  { icon: MapPin, title: "Share your location", text: "Message us on WhatsApp and drop a location pin. We show you the car washes closest to you." },
  { icon: MessageCircle, title: "Answer a few questions", text: "One at a time: your name, how you want it washed, your car, the day and time, scent and any allergies." },
  { icon: Users, title: "Get your ticket", text: "Two employees are assigned and you get your place in the day's queue, who will wash your car, and directions." },
];

function Landing() {
  const mode = useMode();
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-4 md:gap-8 md:px-8 md:py-6">
      <header className="wave-header rounded-[var(--radius-card)] px-5 py-8 md:px-10 md:py-12">
        <p className="relative flex items-center gap-2 text-sm font-semibold tracking-wide text-[#c4f3ff] uppercase">
          <Droplets className="size-4" aria-hidden="true" /> WashSlot
        </p>
        <h1 className="relative mt-1 font-display text-4xl font-semibold text-white md:text-6xl">Book a clean car in one message.</h1>
        <p className="relative mt-3 max-w-2xl text-lg text-[#e3fbff]">
          A WhatsApp assistant that finds the nearest car wash, books your slot, and tells you exactly who will wash your car.
        </p>
        <div className="relative mt-6 flex flex-wrap gap-3">
          <a href="/register" className="inline-flex min-h-11 items-center rounded-full bg-cyan px-6 font-bold text-cyan-ink">
            Register your car wash
          </a>
        </div>
      </header>

      <section aria-labelledby="how" className="flex flex-col gap-4">
        <h2 id="how" className="font-display text-2xl font-semibold">For clients</h2>
        <ul className="grid gap-4 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="glass-card flex flex-col gap-2 rounded-[var(--radius-card)] p-5">
              <Icon className="size-6 text-accent" aria-hidden="true" />
              <h3 className="font-display text-lg font-semibold">{title}</h3>
              <p className="text-muted">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="owners" className="glass-card flex flex-col gap-3 rounded-[var(--radius-card)] p-5">
        <h2 id="owners" className="font-display text-2xl font-semibold">For car wash owners</h2>
        <p>
          Register your wash with your prices, your team and your location. Once approved, clients near you can book with you on WhatsApp, and you see every conversation and booking live on your private dashboard. You can add walk-ins yourself and free up a slot when a client is late.
        </p>
        <p className="text-muted">
          Already registered? Open the private dashboard link you were given. It is shown once, when you sign up.
        </p>
      </section>

      {mode === "demo" && (
        <p className="text-sm text-muted">
          Demo mode: <a className="font-semibold text-accent underline" href="/demo">simulated booking desk</a> ·{" "}
          <a className="font-semibold text-accent underline" href="/live">presenter view</a>
        </p>
      )}
    </main>
  );
}
