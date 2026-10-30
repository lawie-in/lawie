# T-674: court catalogue, complete ruling (Ajay, CLO)

29 Oct 2026. Source: Anushka run 5, Blocker 1. Data: `apps/drafting/src/config/courts/indian-courts.json` (1,754 courts). Legal content: nothing merges before I name an approved SHA.

## What is wrong today (I checked the file)

| State | Today |
|---|---|
| Uttar Pradesh | 1 district court (Lucknow) and 1 CJM (Lucknow). No Civil Judge (Sr/Jr Div) at all. |
| Bihar | District, CJM and Civil Sr/Jr: Patna only. Nalanda is missing. |
| Telangana | District courts for 32 districts, but none for Hyderabad. No civil-judge courts anywhere. |
| Kerala | District courts for 12 of 14 districts. Ernakulam and Thiruvananthapuram are missing. No Munsiff or Sub Court entries. |
| Rajasthan | 49 district entries, including "Jaipur Rural" but no Jaipur (Jaipur Metropolitan). No civil-judge courts. |

## Rules (binding, every state)

**R1. Never substitute a court.** A suit in a district with no matching court must never become another district's court. This covers the Sitapur → Lucknow case. When the chosen state/type has no entry for the user's district:
- the user types the court name and place, which are printed exactly as typed; or
- they are left as `[To be confirmed: Court]` / `[To be confirmed: Court place]`.

The matcher and the model may never pick a court from a different district.

**R2. The district comes from the user, not from a nearby city.** If the facts name a district or town, it is matched only to a court of that district. A town that is not a district seat maps to its own district only through a verified town → district table. With no table entry, R1 applies.

**R3. Every district court gets the full set of court types its state uses.** Generate each designation from the formula below. Nothing is hand-guessed per city.

**R4. No internal ids on screen.** Ids such as `up_district_lucknow` or `mp_sessions_bhopal` never appear. Show the label: `<Court label>, <Place>`.

**R5. The district list comes from an official source.** Arjun pulls the district and judgeship list per state from the official eCourts district court directory (or the High Court's own site) and records the source URL and date in `_meta`. I check it before seeding. I do not supply district lists from memory.

**R6. Re-seed on prod** is a release step (AC4), done after my approval of the data SHA.

## Designations per state (cause-title forms)

`{D}` is the district or judgeship name and `{P}` the court place. Lines marked **verify** stay out of the data until I confirm them against the High Court's or eCourts' own wording.

| State | Civil, senior | Civil, junior | District / Sessions | Magistrate |
|---|---|---|---|---|
| Uttar Pradesh | `Civil Judge (Senior Division), {D}` | `Civil Judge (Junior Division), {D}` | `District Judge, {D}` / `Sessions Judge, {D}` | `Chief Judicial Magistrate, {D}` |
| Bihar | `Civil Judge (Senior Division), {D}` | `Civil Judge (Junior Division), {D}` (formerly Munsif, per T-613) | `District Judge, {D}` / `Sessions Judge, {D}` | `Chief Judicial Magistrate, {D}` |
| Kerala | `Sub Judge, {P}` (Sub Court) | `Munsiff, {P}` (Munsiff's Court) | `District Judge, {D}` / `Sessions Judge, {D}` | `Chief Judicial Magistrate, {D}`; `Judicial First Class Magistrate, {P}` — **verify** the exact forms |
| Telangana (districts) | `Senior Civil Judge, {P}` | `Junior Civil Judge, {P}` | `Principal District Judge, {D}` / `Principal District and Sessions Judge, {D}` — **verify** | `Chief Judicial Magistrate, {D}` (excluding Hyderabad) |
| Telangana (Hyderabad) | `Chief Judge, City Civil Court, Hyderabad` — **verify** the forms for Additional Chief Judge and Junior Civil Judge, City Civil Court | | `Metropolitan Sessions Judge, Hyderabad` — **verify** | `Metropolitan Magistrate, Hyderabad` — **verify** |
| Rajasthan | **verify**: whether the cadre names are "Civil Judge (Senior Division)/(Junior Division)" or "Senior Civil Judge / Civil Judge" in current cause titles | | `District and Sessions Judge, {D}`; Jaipur is **verify**: whether "Jaipur Metropolitan" is its own judgeship (Jaipur Metropolitan I/II) | `Chief Judicial Magistrate, {D}`; Jaipur Metropolitan: `Chief Metropolitan Magistrate, Jaipur Metropolitan` — **verify** |

## The five places in Anushka's run (data needed first)

- **Sitapur (UP):** all five UP types for Sitapur district.
- **Nalanda (Bihar):** the judgeship seat is at Bihar Sharif. Courts are named for Nalanda with place Biharsharif. Exact form "Nalanda at Biharsharif": **verify** against Patna HC/eCourts.
- **Hyderabad:** City Civil Court and the Metropolitan courts, per the table.
- **Ernakulam and Thiruvananthapuram:** District Court, Sub Court and Munsiff's Court for each.
- **Jaipur:** Jaipur Metropolitan (district/sessions, CJM/CMM, civil), alongside the existing Jaipur District (Rural).

## Districts that were split or abolished

Where a state has created or abolished districts in recent years (Rajasthan 2023–24 among them), the judgeship list follows the High Court's list at the source date, not the revenue map. Each entry carries the source date. The current Rajasthan list: **verify**.

## Tests

- A Sitapur civil suit gives `Civil Judge (Senior Division), Sitapur` (or Junior, by the pack's rule), never Lucknow.
- A district with no entry gives the typed name or a blank, never a neighbour's court.
- No id string ever reaches the screen or a draft.
- Every court in the 5 states has a label and a place, with no `null`.

## Next

1. Arjun sends the official district/judgeship lists (R5) and the per-state designation sources for the **verify** rows.
2. I check them and sign the data.
3. A lead builds and seeds.

Interim (already ruled in run5-rulings): a typed court name is printed exactly as typed.
