import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Droplets, MapPin } from "lucide-react";

export const Route = createFileRoute("/register")({ component: Register });

type Done = { dashboard: string; status: string };

const field = "min-h-11 w-full rounded-2xl border border-line bg-white px-4 py-2 text-ink";

function Register() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState(false);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [geoNote, setGeoNote] = useState<string | null>(null);

  function useMyLocation() {
    setGeoNote(null);
    if (!navigator.geolocation) return setGeoNote("This browser can’t share a location. Type the coordinates instead.");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude.toFixed(5));
        setLng(p.coords.longitude.toFixed(5));
        setGeoNote("Location filled in. Stand at your wash when you do this.");
      },
      () => setGeoNote("Location was blocked. Type the coordinates instead (right-click your wash in Google Maps to copy them)."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const travel = String(f.get("travel") ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [suburb, fee] = l.split(/[:=,]/);
        return { suburb: (suburb ?? "").trim(), fee: Number((fee ?? "0").replace(/[^\d.]/g, "")) || 0 };
      });
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: f.get("name"),
        ownerName: f.get("ownerName"),
        phone: f.get("phone"),
        address: f.get("address"),
        lat: Number(lat),
        lng: Number(lng),
        sedanPrice: Number(f.get("sedanPrice")),
        suvPrice: Number(f.get("suvPrice")),
        staff: String(f.get("staff") ?? "").split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
        travel,
      }),
    }).catch(() => null);
    setBusy(false);
    const data = (await res?.json().catch(() => null)) as ({ ok: boolean; error?: string } & Partial<Done>) | null;
    if (!data?.ok) return setError(data?.error ?? "Could not register. Check your connection and try again.");
    setDone({ dashboard: data.dashboard!, status: data.status! });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-5 px-4 py-4 md:px-8 md:py-6">
      <header className="wave-header rounded-[var(--radius-card)] px-5 py-6 md:px-8">
        <p className="relative flex items-center gap-2 text-sm font-semibold tracking-wide text-[#c4f3ff] uppercase">
          <Droplets className="size-4" aria-hidden="true" /> For car wash owners
        </p>
        <h1 className="relative font-display text-3xl font-semibold text-white md:text-5xl">Put your wash on WashSlot</h1>
        <p className="relative mt-1 text-[#e3fbff]">
          Clients share a location pin on WhatsApp and our agent shows them the nearest registered washes. It takes their booking, assigns two of your employees and sends the client a ticket.
        </p>
      </header>

      {done ? (
        <section className="glass-card flex flex-col gap-3 rounded-[var(--radius-card)] p-5" aria-live="polite">
          <h2 className="font-display text-2xl">You’re registered 🎉</h2>
          <p>
            Your wash is <b>waiting for approval</b>. Clients will only see it once the WashSlot team approves it.
          </p>
          <p>
            This is your <b>private dashboard link</b>. It is shown only once, so save it now and don’t share it:
          </p>
          <a className="break-all rounded-2xl border border-line bg-white p-3 font-mono text-sm text-accent underline" href={done.dashboard}>
            {typeof window !== "undefined" ? window.location.origin : ""}{done.dashboard}
          </a>
        </section>
      ) : (
        <form onSubmit={submit} className="glass-card flex flex-col gap-4 rounded-[var(--radius-card)] p-5">
          <label className="flex flex-col gap-1 font-semibold">Business name
            <input name="name" required minLength={3} maxLength={60} className={field} autoComplete="organization" />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1 font-semibold">Your name
              <input name="ownerName" required maxLength={60} className={field} autoComplete="name" />
            </label>
            <label className="flex flex-col gap-1 font-semibold">Phone
              <input name="phone" type="tel" required maxLength={20} className={field} autoComplete="tel" />
            </label>
          </div>
          <label className="flex flex-col gap-1 font-semibold">Address of your wash
            <input name="address" required minLength={5} maxLength={120} className={field} placeholder="12 Main Road, Randburg" autoComplete="street-address" />
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="font-semibold">Location pin</legend>
            <button type="button" onClick={useMyLocation} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full bg-cyan px-5 font-bold text-cyan-ink">
              <MapPin className="size-4" aria-hidden="true" /> Use my location
            </button>
            <div className="grid gap-3 md:grid-cols-2">
              <input aria-label="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} required inputMode="decimal" placeholder="Latitude, e.g. -26.1467" className={field} />
              <input aria-label="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} required inputMode="decimal" placeholder="Longitude, e.g. 28.0436" className={field} />
            </div>
            {geoNote && <p className="text-sm text-muted">{geoNote}</p>}
          </fieldset>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1 font-semibold">Sedan wash price (R)
              <input name="sedanPrice" type="number" min={1} max={4999} required inputMode="numeric" className={field} />
            </label>
            <label className="flex flex-col gap-1 font-semibold">SUV wash price (R)
              <input name="suvPrice" type="number" min={1} max={4999} required inputMode="numeric" className={field} />
            </label>
          </div>
          <label className="flex flex-col gap-1 font-semibold">Employees (at least two, one per line or comma separated)
            <textarea name="staff" required rows={3} className={field} placeholder={"Kamo\nLovely\nSipho"} />
            <span className="text-sm font-normal text-muted">Each booking uses two of them, so more employees means more cars per time slot.</span>
          </label>
          <label className="flex flex-col gap-1 font-semibold">Suburbs your crew travels to (optional)
            <textarea name="travel" rows={3} className={field} placeholder={"Melville: 30\nParkhurst: 20"} />
            <span className="text-sm font-normal text-muted">One per line as “suburb: travel fee in rand”. Leave empty if clients always bring the car to you.</span>
          </label>
          {error && <p role="alert" className="rounded-2xl bg-[#fff0e4] px-4 py-3 font-semibold text-[#9a3412]">{error}</p>}
          <button type="submit" disabled={busy} className="min-h-11 rounded-full bg-accent px-6 font-semibold text-accent-ink disabled:opacity-60">
            {busy ? "Registering…" : "Register my car wash"}
          </button>
        </form>
      )}
    </main>
  );
}
