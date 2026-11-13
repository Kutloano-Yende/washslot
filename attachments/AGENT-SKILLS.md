# Skills to save after the workflow passes

These are proposed reusable instructions for the Bot. The human team skills and responsibilities are in TEAM-PLAYBOOK.md. These definitions do not install anything automatically.

## Exact setup list

Install **Grok Bot** using the organisers' access instructions or the [official getting-started guide](https://docs.x.ai/grok-bot/get-started).

For the spreadsheet version, open **Connect apps** and add **Google Sheets** (read/write the demo records) and **Google Drive** (find/open the demo spreadsheet). Add **Google Calendar** only if the team is implementing the optional calendar view. Authenticate the chosen personal/demo account and verify each connection. The CSV version uses the Bot's computer and does not require those Google apps. These names are app connections, not custom skill packages. See the [official app guide](https://docs.x.ai/grok-bot/computer-and-apps).

Create and save these four custom skills with these exact names:

1. **Qualify an enquiry**
2. **Quote and offer a slot**
3. **Record one confirmed demo booking**
4. **Summarise for the owner**

They are kit-specific skills to create from the definitions below, not marketplace entries we have verified as available to install. No third-party skill pack is required by this proposed workflow. After a successful test, tell the Bot to save them. If a saved skill is missing, use Connect apps → connected count → Private skills to enable it for the current Bot. Ask for a skill by its exact name, then verify its behavior with the test cases. See [Grok Bot skills documentation](https://docs.x.ai/grok-bot/skills-routines-and-automations).

Copy-and-paste setup instruction:

> Read AGENT-SKILLS.md and BOT-PROMPT.txt. After we complete the first successful booking test, save four custom skills named exactly “Qualify an enquiry”, “Quote and offer a slot”, “Record one confirmed demo booking”, and “Summarise for the owner”. Include each trigger, required sources, steps, validation, output, and approval boundary. Show the saved skill names and verify they are available to this Bot. Ask me to authenticate only the apps required by our chosen CSV or Google Sheets setup. Do not invent an installed app or a saved skill.

## 1. Qualify an enquiry

Trigger: a simulated customer asks for a wash or booking.
Inputs: customer message, Services, Zones, optional existing customer ID, demo date 13 November 2026.
Steps: read known customer details if an ID is supplied; check supplied service/suburb against source rules; identify vehicle, service, suburb, date, and time; ask one concise question for missing or ambiguous details; show existing details for confirmation rather than assuming they still apply.
Validate: no unsupported suburb promised; explicit date/time in Africa/Johannesburg; no booking write.
Output: structured request, missing fields, or owner-review reason.

## 2. Quote and offer a slot

Trigger: a supported request has all required details.
Inputs: Services, Zones, Bookings, optional demo calendar.
Steps: calculate base price plus travel fee; check requested slot against current bookings; offer an available slot or valid alternative; present the exact service, vehicle, suburb, explicit date/time, and total for customer confirmation.
Validate: price components match source rows; slot is one of 09:00, 11:00, 13:00, 15:00 Monday–Saturday; each appointment occupies 90 minutes; absent/unavailable source means owner review.
Output: quote and offer only. Do not reserve before confirmation.

## 3. Record one confirmed demo booking

Trigger: explicit yes to the latest exact offer.
Inputs: confirmed offer, current Customers and Bookings, one operator/writer.
Steps: check whether that confirmation already has a booking; re-read availability; create a new customer ID only if needed and verify it; append one uniquely identified booking; re-read and verify the row and slot; return the existing ID on repeated confirmation. If an append times out, look for the row before retrying. Stop for owner review when the result is uncertain.
Validate: exactly one confirmed row for the slot; customer ID references a known customer; price and start/end times match the accepted offer. Sheet/CSV sequencing is for the single-writer demo; production concurrency needs atomic reservation logic.
Output: verified booking ID or an explicit pending state. If calendar sync fails after a verified booking, retain confirmed booking status and separately flag the failed sync. Never retry the booking append to fix calendar sync.

## 4. Summarise for the owner

Trigger: the booking attempt finishes or needs an exception decision.
Inputs: request, actual source/tool results, booking ID if verified, unresolved issues.
Steps: write a short customer reply draft; show the owner the current status, quoted total, actions completed, and next action. Label uncertain results and simulated channels. Keep all messages inside Bot chat for the demo.
Validate: every completed-action claim has a verified source result; no external send, payment, invented price, or unsupported coverage promise.
Output: customer draft and owner note with links or file paths to the actual records.

Suggested instruction: “Save the tested workflow as these four skills, including triggers, inputs, steps, validation, outputs, and approval boundaries. Show me the saved skills and run the valid-booking test again.”
