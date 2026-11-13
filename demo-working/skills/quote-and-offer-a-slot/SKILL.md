---
name: Quote and offer a slot
description: >
  Use when a Demo Wash Co. request already has vehicle, served suburb, date, and time.
  Price it from Services and Zones and offer one free 90-minute slot. Do not reserve it.
---

# Quote and offer a slot

Trigger: a supported request has all required details.

Inputs: Services, Zones, Bookings, optional demo calendar.

Steps:
- Total = base price + listed travel fee, in rand.
- Check the requested slot against current bookings.
- Offer that slot if free, otherwise one valid alternative: 09:00, 11:00, 13:00, or 15:00, Monday–Saturday.
- Each appointment is 90 minutes.
- Present the exact service, vehicle, suburb, explicit date and time, and total.

Validate: price components match source rows. If a source is missing or unreadable, stop for owner review.

Output: a quote and an offer only. Do not reserve before confirmation.

Approval boundary: an enquiry is not a yes. Changed details need a new offer.
