# Kutloano and team — start here

Prepared with Silindokuhle for the Johannesburg hackathon, 13 November 2026.

This kit proposes one complete workflow: a fictional mobile car wash enquiry becomes a verified demo booking. Adapt the business example if the team already chose another problem. The kit contains preparation materials and fictional data; a live Grok Bot has not been configured or tested by the person preparing this package.

1. Read `TEAM-PLAYBOOK.md` for the problem, human roles, build steps, acceptance cases, and pitch.
2. Unzip the kit. Upload all ten extracted files to the team's Grok Bot conversation so it can read the plan, prompts, skills, tests, and data. Keep original CSVs as seeds. If uploads are limited, attach the four data CSVs plus `BOT-PROMPT.txt` first, then the remaining five files.
3. Paste `BUILD-PROMPT.txt` into Grok Bot to have it set up the working copies and walk through the build. It should report real tool results and stop for any missing account access.
4. `BOT-PROMPT.txt` is the copy-and-paste operating prompt for the booking assistant. The same text appears in the playbook.
5. Use `AGENT-SKILLS.md` to turn the tested workflow into reusable skills.
6. Record what actually happens in `TEST-RESULTS.csv`. Every test starts as NOT RUN.

The CSVs map to four spreadsheet tabs if using Google Sheets: services.csv → Services; zones.csv → Zones; customers.csv → Customers; bookings.csv → Bookings.

Quick first demo input: “Hi, I'm Naledi Demo. I need an SUV exterior and interior wash in Melville on 14 November 2026 at 11:00.” Expected quote: R160 service + R30 travel = R190. The Bot should ask for confirmation, then write and verify one booking after yes. A second customer requesting that slot should be offered an alternative.

Use one operator and one writer. Sheets/CSV checks demonstrate the workflow sequentially; they do not establish safe handling of simultaneous bookings. Start with the Bot and a visible data source. Add a dashboard only if the working flow and tests are already complete.

Ask the organisers for the exact submission deadline, judging rubric, and whether they require an external app integration. The official event page is https://luma.com/spacexai-0jmr.
