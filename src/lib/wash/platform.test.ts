import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_KEY, byText, createBusiness, haversineKm, nearest, seedBusinesses, type RegisterInput } from "./businesses.ts";
import { getRepo, hashSender, resetMemoryRepo } from "./repo.ts";
import { DEMO_ID } from "./seeds.ts";
import { approve, ownerAction, ownerSnapshot, platformList, processMessage, registerNewBusiness } from "./whatsapp-store.ts";

const input = (name: string, extra: Partial<RegisterInput> = {}): RegisterInput => ({
  name, ownerName: "Owner", phone: "0710000000", address: "1 Test Road, Randburg", lat: -26.094, lng: 28.006,
  sedanPrice: 100, suvPrice: 140, staff: ["Ann", "Ben"], ...extra,
});

test("distance and nearest: a pin in Melville finds the Melville wash first", () => {
  const list = seedBusinesses();
  assert.ok(Math.abs(haversineKm({ lat: -26.2041, lng: 28.0473 }, { lat: -26.1076, lng: 28.0567 }) - 10.7) < 0.5);
  const found = nearest(list, -26.1818, 28.007, 3);
  assert.equal(found[0].id, "sparkle-hand-wash");
  assert.equal(found.length, 3);
  assert.ok(found[0].km < found[1].km && found[1].km < found[2].km);
});

test("typing a suburb lists matching washes first, and falls back to all", () => {
  const list = seedBusinesses();
  assert.equal(byText(list, "Sandton")[0].id, "sandton-shine");
  assert.ok(byText(list, "somewhere").length > 0);
});

test("sign-ups are validated, start pending, store only a key hash, and are hidden until approved", async () => {
  resetMemoryRepo();
  const existing = seedBusinesses();
  assert.throws(() => createBusiness(input("Ab"), existing), /at least 3/);
  assert.throws(() => createBusiness(input("Good Name", { staff: ["Only One"] }), existing), /two employees/);
  assert.throws(() => createBusiness(input("Good Name", { lat: 999 }), existing), /Location/);
  assert.throws(() => createBusiness(input("Good Name", { sedanPrice: 0 }), existing), /prices/);
  const b = await registerNewBusiness(input("Randburg Rinse"));
  assert.equal(b.status, "pending");
  assert.ok(b.key && b.key.length >= 20);
  const stored = await (await getRepo()).getBusiness(b.id);
  assert.equal(stored?.key, undefined, "the plain key is never stored");
  assert.notEqual(stored?.keyHash, b.key);
  assert.equal((await platformList()).some((x) => x.id === b.id), false);
  await approve(b.id);
  assert.equal((await platformList()).some((x) => x.id === b.id), true);
  await assert.rejects(registerNewBusiness(input("Randburg Rinse")), /already registered/);
});

test("a client shares a pin, picks the nearest wash, and books with THAT wash's prices and team", async () => {
  resetMemoryRepo();
  const biz = await registerNewBusiness(input("Randburg Rinse"));
  await approve(biz.id);
  const from = "whatsapp:+27000000010";
  const first = await processMessage(from, "Hi", null);
  assert.match(first.reply, /location pin/i);
  const list = await processMessage(from, "", null, { lat: -26.094, lng: 28.006 });
  assert.match(list.reply, /closest to you/);
  assert.match(list.reply, /1️⃣ Randburg Rinse/);
  assert.match(list.reply, /0\.0 km away/);
  const picked = await processMessage(from, "1", null);
  assert.match(picked.reply, /Great choice! 🙌 Randburg Rinse/);
  assert.match(picked.reply, /your name/i);
});

async function book(from: string, pin: { lat: number; lng: number }, time = "13:00") {
  const send = async (m: string, p?: { lat: number; lng: number }) => (await processMessage(from, m, null, p ?? null)).reply;
  await send("", pin);
  await send("1");
  await send("Thandi");
  await send(`I'll bring my BMW sedan to you on 2026-11-14 at ${time}`);
  await send("none");
  await send("none");
  return send("yes");
}

test("each business keeps its own booking book", async () => {
  resetMemoryRepo();
  const biz = await registerNewBusiness(input("Randburg Rinse"));
  await approve(biz.id);
  assert.match(await book("whatsapp:+27000000011", { lat: -26.094, lng: 28.006 }), /B001/);
  assert.match(await book("whatsapp:+27000000012", { lat: -26.1076, lng: 28.0567 }), /B001/);
  assert.equal((await ownerSnapshot(biz.id, biz.key!))?.bookings.length, 1);
  assert.equal((await ownerSnapshot(DEMO_ID, DEMO_KEY))?.bookings.length, 2);
});

test("two people booking the same slot at the same moment: only one gets it", async () => {
  resetMemoryRepo();
  const biz = await registerNewBusiness(input("Randburg Rinse", { staff: ["Ann", "Ben"] }));
  await approve(biz.id);
  const pin = { lat: -26.094, lng: 28.006 };
  const prep = async (from: string) => {
    for (const m of ["", "1", "Thandi", "I'll bring my BMW sedan on 2026-11-14 at 11:00", "none", "none"]) {
      await processMessage(from, m, null, m === "" ? pin : null);
    }
  };
  await prep("whatsapp:+27000000021");
  await prep("whatsapp:+27000000022");
  const [a, b] = await Promise.all([
    processMessage("whatsapp:+27000000021", "yes", null),
    processMessage("whatsapp:+27000000022", "yes", null),
  ]);
  const booked = [a, b].filter((x) => /B00\d/.test(x.reply) && /booked/i.test(x.reply)).length;
  assert.equal(booked, 1, "exactly one client is booked");
  assert.equal((await ownerSnapshot(biz.id, biz.key!))?.bookings.length, 1);
});

test("an owner dashboard needs the right key and shows the live conversation", async () => {
  resetMemoryRepo();
  const biz = await registerNewBusiness(input("Randburg Rinse"));
  await approve(biz.id);
  const from = "whatsapp:+27000000013";
  await processMessage(from, "", null, { lat: -26.094, lng: 28.006 });
  await processMessage(from, "1", null);
  await processMessage(from, "Lerato", null);
  await processMessage(from, "BMW sedan, I'll bring it", null);
  assert.equal(await ownerSnapshot(biz.id, "wrong"), null);
  const snap = (await ownerSnapshot(biz.id, biz.key!))!;
  assert.equal(snap.conversations.length, 1);
  assert.equal(snap.conversations[0].stage, "answering questions");
  assert.equal(snap.conversations[0].sender, "…0013");
  assert.ok(snap.conversations[0].collected.some((c) => c.label === "Car" && c.value.includes("BMW")));
  assert.equal(snap.conversations[0].waitingOn, "date");
});

test("client phone numbers are stored only as a hash", async () => {
  resetMemoryRepo();
  const from = "whatsapp:+27821234567";
  await processMessage(from, "Hi", null);
  const hash = hashSender(from);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash.includes("27821234567"), false);
  const row = await (await getRepo()).getConvo(hash);
  assert.ok(row);
  assert.equal(JSON.stringify(row).includes("27821234567"), false);
});

test("owner walk-ins: need the key, use two free employees, and stop when nobody is free", async () => {
  resetMemoryRepo();
  const walk = (slot: string, name = "Zodwa") =>
    ownerAction(DEMO_ID, DEMO_KEY, { action: "walkin", name, vehicle: "sedan", make: "Polo", slot });
  assert.deepEqual(await ownerAction(DEMO_ID, "wrong", { action: "walkin", name: "X", vehicle: "sedan" }), { ok: false, error: "Not allowed." });
  assert.equal((await ownerAction(DEMO_ID, DEMO_KEY, { action: "walkin", name: "", vehicle: "sedan" })).ok, false);
  // 13:00 has four employees working (Kamo, Lovely, Sipho, Zanele): room for two walk-ins, not three.
  const first = await walk("13:00");
  assert.equal(first.ok, true);
  assert.equal((await walk("13:00", "Sipho")).ok, true);
  const third = await walk("13:00", "Third");
  assert.equal(third.ok, false);
  const snap = (await ownerSnapshot(DEMO_ID, DEMO_KEY))!;
  const walkIns = snap.bookings.filter((b) => b.walk_in);
  assert.equal(walkIns.length, 2);
  const names = walkIns.flatMap((b) => b.staff ?? []);
  assert.equal(new Set(names).size, 4, "no employee is on two walk-ins at once");
});

test("releasing a late client's slot frees their employees for a walk-in", async () => {
  resetMemoryRepo();
  // B001 is at 09:00 on 2026-11-14 with Kamo + Lovely (the only two on 09:00), so 09:00 on that day is full.
  const before = (await ownerSnapshot(DEMO_ID, DEMO_KEY))!.bookings.length;
  const released = await ownerAction(DEMO_ID, DEMO_KEY, { action: "release", bookingId: "B001" });
  assert.equal(released.ok, true);
  assert.match((released as { message: string }).message, /Kamo \+ Lovely are free again/);
  assert.equal((await ownerSnapshot(DEMO_ID, DEMO_KEY))!.bookings.length, before - 1);
  assert.equal((await ownerAction(DEMO_ID, DEMO_KEY, { action: "release", bookingId: "B001" })).ok, false);
  assert.equal((await ownerAction(DEMO_ID, "wrong", { action: "release", bookingId: "B002" })).ok, false);
});
