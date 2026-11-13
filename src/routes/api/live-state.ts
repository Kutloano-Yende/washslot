import { createFileRoute } from "@tanstack/react-router";
import { snapshot } from "@/lib/wash/whatsapp-store";

/** Read-only JSON for the /live page. Fictional data; sender numbers are masked. */
export const Route = createFileRoute("/api/live-state")({
  server: {
    handlers: {
      GET: async () => Response.json(snapshot(), { headers: { "cache-control": "no-store" } }),
    },
  },
});
