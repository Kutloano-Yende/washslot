---
name: Qualify an enquiry
description: >
  Use when a simulated customer asks Demo Wash Co. for a wash or booking.
  Identify vehicle, suburb, date, and time. Ask one concise question for gaps.
  Do not write a booking.
---

# Qualify an enquiry

Trigger: a simulated customer asks for a wash or booking.

Inputs: customer message, Services, Zones, optional customer ID, demo date 13 November 2026.

Steps:
- Read known customer details if an ID is supplied.
- Check the service and suburb against source rules.
- Identify vehicle, service, suburb, date, and time.
- Ask one concise question for anything missing or ambiguous.
- Show stored details for confirmation instead of assuming they still apply.

Validate: no unsupported suburb is promised; date and time are explicit in Africa/Johannesburg; no booking write.

Output: a structured request, the missing fields, or an owner-review reason.

Approval boundary: qualification never reserves a slot and never sends a message outside the chat.
