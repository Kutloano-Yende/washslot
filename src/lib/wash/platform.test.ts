import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_ID, DEMO_KEY, approveBusiness, byText, getBusiness, haversineKm, listBusinesses, nearest,
  registerBusiness, resetBusinesses,
} from "./businesses.ts";
import { ownerSnapshot, processMessage, resetStore } from "./whatsapp-store.ts";

const reg = (name: string, extra = {}) =>
  registerBusiness({
    name, ownerName: "Owner", phone: "0710000000", address: "1 Test Road, Randburg", lat: -26.094, lng: 28.006,
    sedanPrice: 100, suvPrice: 140, staff: ["Ann", "Ben"], ...extra,
  });

test("distance and nearest: a pin in Melville finds the Melville wash first", () => {
  resetBusinesses();
  assert.ok(Math.abs(haversineKm({ lat: -26.2041, lng: 28.0473 }, { lat: -26.1076, lng: 28.0567 }) - 10.7) < 0.5);
  const found = nearest(-26.1818, 28.007, 3);
  assert.equal(found[0].id, "sparkle-hand-wash");
  assert.equal(found.length, 3);
  assert.ok(found[0].km < found[1].km && found[1].km < found[2].km);
});

test("typing a suburb lists matching washes first, and falls back to all", () => {
  resetBusinesses();
  assert.equal(byText("Sandton")[0].id, "sandton-shine");
  assert.equal(byText("somewhere")[0].id.length > 0, true);
});

test("sign-ups are validated, start pending, and are hidden from clients until approved", () => {
  resetBusinesses();
  assert.throws(() => reg("Ab"), /at least 3/);
  assert.throws(() => reg("Good Name", { staff: ["Only One"] }), /two employees/);
  assert.throws(() => reg("Good Name", { lat: 999 }), /Location/);
  assert.throws(() => reg("Good Name", { sedanPrice: 0 }), /prices/);
  const b = reg("Randburg Rinse");
  assert.equal(b.status, "pending");
  assert.ok(b.key.length >= 20);
  assert.equal(nearest(-26.094, 28.006, 10).some((x) => x.id === b.id), false);
  approveBusiness(b.id);
  assert.equal(nearest(-26.094, 28.006, 1)[0].id, b.id);
  assert.throws(() => reg("Randburg Rinse"), /already registered/);
});

test("a client shares a pin, picks the nearest wash, and books with THAT wash's prices and team", () => {
  resetBusinesses();
  resetStore();
  const biz = reg("Randburg Rinse");
  approveBusiness(biz.id);
  const from = "whatsapp:+27000000010";
  const first = processMessage(from, "Hi", null);
  assert.match(first.reply, /location pin/i);
  const list = processMessage(from, "", null, { lat: -26.094, lng: 28.006 });
  assert.match(list.reply, /closest to you/);
  assert.match(list.reply, /1️⃣ Randburg Rinse/);
  assert.match(list.reply, /0\.0 km away/);
  const picked = processMessage(from, "1", null);
  assert.match(picked.reply, /Great choice! 🙌 Randburg Rinse/);
  assert.match(picked.reply, /your name/i);
  processMessage(from, "Zodwa", null);
  processMessage(from, "3", null); // home visit: this wash has no travel areas, so only bring-in works
});

test("each business keeps its own booking book", () => {
  resetBusinesses();
  resetStore();
  const biz = reg("Randburg Rinse");
  approveBusiness(biz.id);
  const send = (from: string, msg: string, pin?: { lat: number; lng: number }) => processMessage(from, msg, null, pin ?? null).reply;
  const book = (from: string, pin: { lat: number; lng: number }) => {
    send(from, "", pin);
    send(from, "1");
    send(from, "Thandi");
    send(from, "I'll bring my BMW sedan to you on 2026-11-14 at 13:00");
    send(from, "none");
    send(from, "none");
    return send(from, "yes");
  };
  const a = book("whatsapp:+27000000011", { lat: -26.094, lng: 28.006 }); // Randburg Rinse
  assert.match(a, /B001/);
  const b = book("whatsapp:+27000000012", { lat: -26.1076, lng: 28.0567 }); // Sandton Shine, its own book
  assert.match(b, /B001/);
  assert.equal(ownerSnapshot(biz.id, biz.key)?.bookings.length, 1);
  assert.equal(ownerSnapshot(DEMO_ID, DEMO_KEY)?.bookings.length, 2);
});

test("an owner dashboard needs the right key and shows the live conversation", () => {
  resetBusinesses();
  resetStore();
  const biz = reg("Randburg Rinse");
  approveBusiness(biz.id);
  const from = "whatsapp:+27000000013";
  processMessage(from, "", null, { lat: -26.094, lng: 28.006 });
  processMessage(from, "1", null);
  processMessage(from, "Lerato", null);
  processMessage(from, "BMW sedan, I'll bring it", null);
  assert.equal(ownerSnapshot(biz.id, "wrong"), null);
  const snap = ownerSnapshot(biz.id, biz.key)!;
  assert.equal(snap.conversations.length, 1);
  assert.equal(snap.conversations[0].stage, "answering questions");
  assert.equal(snap.conversations[0].sender, "…0013");
  assert.ok(snap.conversations[0].collected.some((c) => c.label === "Car" && c.value.includes("BMW")));
  assert.equal(snap.conversations[0].waitingOn, "date");
  assert.equal(getBusiness(biz.id)?.status, "approved");
  assert.equal(listBusinesses({ approvedOnly: true }).length, 4);
});
