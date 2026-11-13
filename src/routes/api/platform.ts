import { createFileRoute } from "@tanstack/react-router";
import { listBusinesses, publicView } from "@/lib/wash/businesses";

/** The car washes clients can choose from. Public: names, addresses and locations only. */
export const Route = createFileRoute("/api/platform")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          { businesses: listBusinesses({ approvedOnly: true }).map(publicView) },
          { headers: { "cache-control": "no-store" } },
        ),
    },
  },
});
