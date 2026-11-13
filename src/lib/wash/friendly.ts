/**
 * Friendly WhatsApp voice for the booking bot.
 *
 * The engine's replies are formal ("Offer: ... Reply yes to confirm this exact offer."). Over WhatsApp that reads
 * like a form. This layer re-words them warmly WITHOUT changing a single fact: prices, times, slots, suburbs and
 * booking IDs are copied straight from the engine's own text. It is templates only, never free-written text, so it
 * cannot invent a price or promise a slot. Anything it does not recognise passes through unchanged.
 */

export const BOT_NAME = "Wash Buddy";

const GREETING = /^\s*(hi+|hey+|hello+|howzit|heita|yo|sawubona|molo|dumela|good (morning|afternoon|evening))\b/i;
const ASKS_WHO = /\b(your name|who are you|who is this|who am i (talking|speaking)|are you (a )?(bot|human|real|robot|ai))\b/i;
const AREAS = "Rosebank, Parkwood, Parkhurst or Melville";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const comma = (name: string | null) => (name ? `, ${name}` : "");
// Engine text says "a suv"; say it properly in chat.
const tidy = (s: string) => s.replace(/\ba suv\b/g, "an SUV").replace(/\bsuv\b/g, "SUV");

export type FriendlyInput = {
  /** What the customer just sent. */
  message: string;
  /** The engine's own reply text. Every fact in it is preserved. */
  draft: string;
  /** First name only, or null when unknown. */
  name: string | null;
};

export function friendlyReply({ message, draft, name }: FriendlyInput): string {
  // "What's your name?" / "are you a bot?": introduce myself honestly.
  if (ASKS_WHO.test(message)) {
    return `I'm ${BOT_NAME} 🧽, Demo Wash Co's booking assistant. I'm a bot, but a friendly one!${
      name ? ` Good to meet you, ${name}!` : ""
    } Tell me what you drive and where you are, and I'll sort you a slot.`;
  }

  // Missing details -> ask in a relaxed, bulleted way.
  const missing = draft.match(/^I can book a wash once I have: (.+)\.$/);
  if (missing) {
    const items = missing[1]
      .split(/,\s*(?![^()]*\))/)
      .map((i) => i.trim())
      .map((i) => (i === "a demo name" ? "your name" : i))
      .map((i) =>
        i.startsWith("suburb") ? `suburb (we cover ${AREAS}), or say you’ll bring the car to our wash bay` : i,
      );
    const greeted = GREETING.test(message);
    const opener = greeted
      ? `Hey${comma(name)}! 👋 I'm ${BOT_NAME}, Demo Wash Co's booking assistant. Let's get your car sparkling ✨`
      : `Almost there${comma(name)}! 🙌`;
    if (items.length === 1 && items[0] === "your name") {
      return `${opener} What name should I put the booking under?`;
    }
    return `${opener} I just need:\n${items.map((i) => `• ${i}`).join("\n")}`;
  }

  // A fresh offer.
  if (/^Offer: /.test(draft)) {
    const core = tidy(draft.replace(/^Offer: /, "").replace(/\s*Reply yes to confirm this exact offer\.$/, ""));
    return `Nice one${comma(name)}! 🚗 Here's what I can do:\n\n${core}\n\nShall I lock it in? Just reply *yes* 👍`;
  }

  // Slot already taken, with an alternative.
  const taken = draft.match(/^(.+? is already booked)\.\s*(I can offer .+?)\s*Reply yes to that exact slot\.$/);
  if (taken) {
    return `Ah, that slot's already taken 😅 No stress, ${lowerFirst(tidy(taken[2]))}\n\nReply *yes* and it's yours 👍`;
  }

  // Booking confirmed.
  if (/^Booked B\d+:/.test(draft)) {
    return `You're booked${comma(name)}! 🎉\n\n✅ ${tidy(draft.replace(/^Booked /, ""))}\n\nSee you then! 🧼`;
  }

  // Repeated "yes".
  if (/^You are already booked as B\d+/.test(draft)) {
    return `No worries, you're already sorted 👍 ${draft}`;
  }

  // Returning customer.
  if (/^I have .+ on file as /.test(draft) || /^I have you as /.test(draft)) {
    return `Welcome back${comma(name)}! 👋 ${draft}`;
  }

  // Outside the service area.
  const area = draft.match(/^We do not currently cover (.+?)\./);
  if (area) {
    return `Sorry${comma(name)}, we don't cover ${cap(area[1])} yet 😕 I won't guess a price, but I've flagged it for the owner, who can decide whether to make an exception.`;
  }

  // Booking book unreadable.
  if (/^I cannot see the booking book right now/.test(draft)) {
    return `Eish, I can't see the booking list right now 😕 I won't promise a slot I can't check. The owner will follow up with you soon 🙏`;
  }

  // Someone trying to skip the checks.
  if (/^I still need to check the wash list and the booking book/.test(draft)) {
    return `Ha, I can't skip the checks 😄 I only confirm a booking once I've checked the slot. Tell me your vehicle (sedan or SUV), suburb, date and time, and I'll sort it out properly.`;
  }

  return draft;
}
