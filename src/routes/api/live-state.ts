import { createFileRoute } from "@tanstack/react-router";
import { isProduction } from "@/lib/wash/mode";
import { snapshot } from "@/lib/wash/whatsapp-store";

/** Read-only JSON for the /live page. Fictional data; sender numbers are masked. */
export const Route = createFileRoute("/api/live-state")({
  server: {
    handlers: {
      GET: async () =>
        isProduction()
          ? new Response("Not available in production", { status: 404 })
          : Response.json(await snapshot(), { headers: { "cache-control": "no-store" } }),
    },
  },
});
