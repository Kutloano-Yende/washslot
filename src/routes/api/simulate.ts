import { createFileRoute } from "@tanstack/react-router";
import { processMessage } from "@/lib/wash/whatsapp-store";

/**
 * Presenter-only: lets /live inject a message "from" a demo customer, through the same
 * code path as the real WhatsApp webhook. Refuses anything that did not arrive on
 * localhost, so the public tunnel cannot be used to drive it.
 */
function isLocal(request: Request): boolean {
  const host = (request.headers.get("host") ?? "").split(":")[0];
  const viaTunnel = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for");
  return (host === "localhost" || host === "127.0.0.1") && !viaTunnel;
}

const CUSTOMERS: Record<string, string> = { a: "whatsapp:+27000000001", b: "whatsapp:+27000000002" };

export const Route = createFileRoute("/api/simulate")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        if (!isLocal(request)) return new Response("Forbidden", { status: 403 });
        const data = (await request.json().catch(() => ({}))) as { customer?: string; body?: string };
        const from = CUSTOMERS[data.customer ?? "a"] ?? CUSTOMERS.a;
        const body = String(data.body ?? "").slice(0, 1000).trim();
        if (!body) return Response.json({ ok: false }, { status: 400 });
        const { reply } = processMessage(from, body);
        return Response.json({ ok: true, reply });
      },
    },
  },
});
