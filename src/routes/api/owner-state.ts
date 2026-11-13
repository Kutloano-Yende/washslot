import { createFileRoute } from "@tanstack/react-router";
import { ownerSnapshot } from "@/lib/wash/whatsapp-store";

/** One owner's live dashboard data. Needs the business id and its private key. */
export const Route = createFileRoute("/api/owner-state")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const u = new URL(request.url);
        const snap = await ownerSnapshot(u.searchParams.get("biz") ?? "", u.searchParams.get("key") ?? "");
        if (!snap) return new Response("Forbidden", { status: 403 });
        return Response.json(snap, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
