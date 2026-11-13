---
name: Record one confirmed demo booking
description: >
  Use only after an explicit yes to the latest exact Demo Wash Co. offer.
  Append one verified booking, or return the existing id on a repeated yes.
---

# Record one confirmed demo booking

Trigger: explicit yes to the latest exact offer.

Inputs: the confirmed offer, current Customers and Bookings, one operator and one writer.

Steps:
- If that confirmation already has a booking, return it. Do not append again.
- Re-read availability immediately before writing.
- Create the next unused C-number only if needed, then verify that row. Leave contact email blank unless a fictional example.com address was supplied.
- Append the next unused B-number with status CONFIRMED.
- Re-read and check there is exactly one confirmed booking for that date and slot.
- If a write cannot be verified, report PENDING OWNER REVIEW and stop.

Validate: customer id references a known customer; price and start/end match the accepted offer.

Output: a verified booking id, or an explicit pending state.

Approval boundary: a calendar failure after a verified booking does not undo CONFIRMED and must not cause another append. This demo has no calendar connected.
