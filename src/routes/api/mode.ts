import { createFileRoute } from "@tanstack/react-router";
import { appMode } from "@/lib/wash/mode";

/** "demo" or "production". Production hides the sample businesses and the simulated demo pages. */
export const Route = createFileRoute("/api/mode")({
  server: {
    handlers: {
      GET: async () => Response.json({ mode: appMode() }, { headers: { "cache-control": "no-store" } }),
    },
  },
});
