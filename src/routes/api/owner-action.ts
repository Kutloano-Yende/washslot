import { createFileRoute } from "@tanstack/react-router";
import { ownerAction, type OwnerAction } from "@/lib/wash/whatsapp-store";

/** Owner dashboard actions: add a walk-in, or release a late client's slot. Needs the business id and key. */
export const Route = createFileRoute("/api/owner-action")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const data = (await request.json().catch(() => null)) as ({ biz?: string; key?: string } & Partial<OwnerAction>) | null;
        if (!data?.biz || !data.key || !data.action) return Response.json({ ok: false, error: "Missing details." }, { status: 400 });
        const res = await ownerAction(data.biz, data.key, data as OwnerAction);
        return Response.json(res, { status: res.ok ? 200 : res.error === "Not allowed." ? 403 : 400 });
      },
    },
  },
});
