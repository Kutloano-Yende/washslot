import { createFileRoute } from "@tanstack/react-router";
import { platformList } from "@/lib/wash/whatsapp-store";

/** The car washes clients can choose from. Public: names, addresses and locations only. */
export const Route = createFileRoute("/api/platform")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({ businesses: await platformList() }, { headers: { "cache-control": "no-store" } }),
    },
  },
});
