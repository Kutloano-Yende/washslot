import { createFileRoute } from "@tanstack/react-router";
import { approveBusiness, listBusinesses, publicView } from "@/lib/wash/businesses";

/**
 * Platform admin only (same secret as the WhatsApp webhook key).
 *   GET  /api/admin/approve?key=…            -> businesses waiting for approval
 *   POST /api/admin/approve?key=…&id=…       -> approve one, so clients can see it
 */
function authorised(request: Request): boolean {
  const expected = process.env.WHATSAPP_WEBHOOK_KEY;
  return !!expected && new URL(request.url).searchParams.get("key") === expected;
}

export const Route = createFileRoute("/api/admin/approve")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        if (!authorised(request)) return new Response("Forbidden", { status: 403 });
        return Response.json({ pending: listBusinesses().filter((b) => b.status === "pending").map(publicView) });
      },
      POST: async ({ request }: { request: Request }) => {
        if (!authorised(request)) return new Response("Forbidden", { status: 403 });
        const b = approveBusiness(new URL(request.url).searchParams.get("id") ?? "");
        return b ? Response.json({ ok: true, approved: publicView(b) }) : Response.json({ ok: false }, { status: 404 });
      },
    },
  },
});
