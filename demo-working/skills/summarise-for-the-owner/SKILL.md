---
name: Summarise for the owner
description: >
  Use when a Demo Wash Co. booking attempt finishes or needs an exception decision.
  Draft the customer reply and an owner note from verified source results only.
---

# Summarise for the owner

Trigger: the booking attempt finishes or needs an exception decision.

Inputs: the request, actual source results, booking id if verified, unresolved issues.

Steps:
- Write a short customer reply draft.
- Show the owner the status, quoted total, actions completed, and next action.
- Label uncertain results and simulated channels.
- Keep every message inside the chat for the demo.

Validate: every completed-action claim has a verified source result. No external send, payment, invented price, or unsupported coverage promise.

Output: a customer draft and an owner note pointing at the actual book.

Approval boundary: nothing leaves the chat without the owner. This demo never sends.
