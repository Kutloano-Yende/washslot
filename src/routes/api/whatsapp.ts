import { createFileRoute } from "@tanstack/react-router";
import { processMessage, resetStore, snapshot } from "@/lib/wash/whatsapp-store";

/**
 * Twilio WhatsApp webhook: POST /api/whatsapp?key=<WHATSAPP_WEBHOOK_KEY>
 * Twilio sends form fields From ("whatsapp:+27…") and Body; we answer with TwiML.
 * The shared secret in the URL keeps strangers from driving the demo book.
 */
function authorised(request: Request): boolean {
  const expected = process.env.WHATSAPP_WEBHOOK_KEY;
  if (!expected) return false; // no key configured = endpoint closed
  return new URL(request.url).searchParams.get("key") === expected;
}

const xml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const twiml = (text: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xml(text)}</Message></Response>`, {
    headers: { "content-type": "text/xml; charset=utf-8" },
  });

export const Route = createFileRoute("/api/whatsapp")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        if (!authorised(request)) {
          console.log("[whatsapp] POST rejected: missing or wrong key");
          return new Response("Forbidden", { status: 403 });
        }
        const form = await request.formData();
        const from = String(form.get("From") ?? "").slice(0, 64);
        const body = String(form.get("Body") ?? "").slice(0, 1000);
        // A WhatsApp location pin arrives as Latitude/Longitude (and an empty Body).
        const lat = Number(form.get("Latitude"));
        const lng = Number(form.get("Longitude"));
        const pin = form.get("Latitude") && form.get("Longitude") && Number.isFinite(lat) && Number.isFinite(lng) &&
          Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
        console.log(`[whatsapp] POST ok from …${from.replace(/\D/g, "").slice(-4)} (${body.length} chars${pin ? ", location pin" : ""})`);
        if (!from || (!body.trim() && !pin)) return twiml("Hi! Share your location pin 📍 or tell me what you need, and I'll find you a car wash.");
        const profileName = String(form.get("ProfileName") ?? "").slice(0, 80) || null;
        const { reply } = processMessage(from, body, profileName, pin);
        return twiml(reply);
      },
      // GET ?key=…&reset=1 clears the demo book between rehearsals; plain GET is a health check.
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("reset") === "1") {
          if (!authorised(request)) return new Response("Forbidden", { status: 403 });
          resetStore();
          return Response.json({ ok: true, reset: true });
        }
        return Response.json({ ok: true, bookings: snapshot().bookings.length });
      },
    },
  },
});
