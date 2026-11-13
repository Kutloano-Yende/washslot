import { useEffect, useState } from "react";

export type AppMode = "demo" | "production";

/** Whether the app is running in demo or production mode. null until the server has answered. */
export function useMode(): AppMode | null {
  const [mode, setMode] = useState<AppMode | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/mode", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ mode: AppMode }>)
      .then((d) => alive && setMode(d.mode))
      .catch(() => alive && setMode("production")); // if unsure, never show sample data
    return () => {
      alive = false;
    };
  }, []);
  return mode;
}

/** Shown in place of the simulated demo pages when the app is in production mode. */
export function DemoOff() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-3 px-4 py-10">
      <h1 className="font-display text-3xl font-semibold">The demo is switched off</h1>
      <p className="text-muted">
        This app is running with real data, so the simulated demo pages are hidden. Owners can{" "}
        <a className="font-semibold text-accent underline" href="/register">register a car wash</a>, and clients book on WhatsApp.
      </p>
    </main>
  );
}
