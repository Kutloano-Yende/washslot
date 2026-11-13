import { createFileRoute } from "@tanstack/react-router";
import { registerBusiness, type RegisterInput } from "@/lib/wash/businesses";

/**
 * A car wash owner signs up. The business stays "pending" (hidden from clients) until the platform admin
 * approves it. The reply carries the owner's private dashboard key, shown once.
 */
export const Route = createFileRoute("/api/register")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const data = (await request.json().catch(() => null)) as Partial<RegisterInput> | null;
        if (!data) return Response.json({ ok: false, error: "Send the form as JSON." }, { status: 400 });
        try {
          const b = registerBusiness(data as RegisterInput);
          return Response.json({
            ok: true,
            id: b.id,
            key: b.key,
            status: b.status,
            dashboard: `/owner?biz=${encodeURIComponent(b.id)}&key=${b.key}`,
          });
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : "Could not register." }, { status: 400 });
        }
      },
    },
  },
});
