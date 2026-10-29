# T-674 — Court catalogue covers every district, not a few cities (Anushka Blocker 1)

Status: assigned to mahak, 29 Oct 2026. Ajay ruling a4cb1070 (R1-R5); Arjun pulls the official eCourts/HC district lists for UP, Telangana, Bihar, Kerala and Rajasthan; Ajay signs the data.

## Acceptance criteria
1. Ajay (with Arjun) provides the court list, state by state: court types (incl. Civil Judge Sr/Jr Division) and the districts each covers. First the states where Anushka hit gaps: UP (Sitapur went to "District Judge, Lucknow"), Telangana (no Hyderabad), Bihar CJM (Patna only; Nalanda missing), Kerala (Ernakulam and Thiruvananthapuram missing), Rajasthan (Jaipur missing, only "Jaipur Rural").
2. A suit in a district with no court in the list never silently becomes another district's court: the user is asked, or the court is left as a [To be confirmed] blank.
3. No internal codes on screen (e.g. "up_district_lucknow", "mp_sessions_bhopal").
4. Re-seed courts on prod as a release step.

## Mode
Full chain (drafting data + seed), legal content (Ajay).
