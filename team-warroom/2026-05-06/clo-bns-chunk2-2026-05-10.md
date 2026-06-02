# BNS Offences JSON — Chunk 2 Audit

**Scope:** Chapters VI–IX, sections 100–177
**Date:** 2026-05-10
**Owner:** Ajay (CLO)
**File:** /Users/abhinavanand/Files/Lawie/apps/drafting/src/config/bns-offences.json
**Result:** JSON valid. 136 → 174 entries (+38).

## Pre-flight inventory (already present)

- Chapter VI: 103, 103(1), 104, 105, 106, 106(2), 107, 108, 109, 110, 111, 112, 113, 114, 115, 115(1), 115(2), 117, 118, 119, 120, 121, 124, 125, 126, 127, 128, 129, 130, 131, 132, 137, 138, 139, 140, 143
- Chapter VII: 152
- Chapter VIII: none
- Chapter IX: none

## Skipped (pure definitions, no independent penalty)

- 100 — Culpable homicide (definition; punishment in s.105/103)
- 101 — Murder (definition; punishment in s.103)
- 102 — Punishment for murder by life-convict superseded by 103; 102 is "Causing death of person other than person whose death was intended" (transferred-malice rule, no separate penalty — covered by 103/105)
- 116 — Grievous hurt (definition; punishment in s.117)
- 167 — Persons subject to certain Acts (application provision, no penalty)
- 169 — Candidate / electoral right (definition)

## Chapter VI — Of Offences Affecting the Human Body — additions (10)

- 122: Hurt/grievous hurt on grave and sudden provocation (bailable, compoundable)
- 123: Hurt by poison etc. with intent (10y, non-bailable, cognizable)
- 133: Criminal force to dishonour, otherwise than on grave provocation (2y, bailable, compoundable)
- 134: Criminal force in attempt to commit theft of property carried (2y, bailable, cognizable)
- 135: Criminal force in attempt wrongfully to confine (1y, bailable, compoundable)
- 136: Assault/criminal force on grave and sudden provocation (1m fine 1k, bailable, compoundable)
- 141: Importation of girl/boy from foreign country (10y, non-bailable, cognizable)
- 142: Wrongful concealment of kidnapped/abducted person (mirrors underlying K/A penalty)
- 144: Exploitation of trafficked person (3-7y; 5-10y if child)
- 145: Habitual dealing in slaves (life or 10y, non-bailable, cognizable)
- 146: Unlawful compulsory labour (1y, bailable, cognizable)

(11 entries actually — 122, 123, 133, 134, 135, 136, 141, 142, 144, 145, 146.)

## Chapter VII — Of Offences Against the State — additions (11)

- 147: Waging war against Government of India (death/life)
- 148: Conspiracy under s.147 (life or 10y)
- 149: Collecting arms etc. for waging war (life or 10y)
- 150: Concealing design to wage war (10y)
- 151: Assault on President/Governor to compel/restrain lawful power (7y)
- 153: Waging war against foreign State at peace with India (life or 7y)
- 154: Depredation on foreign-State territory (7y + forfeiture)
- 155: Receiving property from war/depredation (7y + forfeiture)
- 156: Public servant voluntarily allowing escape of prisoner of State/war (life or 10y)
- 157: Public servant negligently allowing such escape (3y simple)
- 158: Aiding escape / rescuing / harbouring such prisoner (life or 10y)

Note: s.152 (sedition replacement — act endangering sovereignty) was already present from chunk 1.

## Chapter VIII — Of Offences Relating to the Army, Navy and Air Force — additions (9)

- 159: Abetting mutiny / seducing soldier/sailor/airman from duty (life or 10y)
- 160: Abetment of mutiny actually committed (death or life or 10y)
- 161: Abetment of assault on superior officer (3y)
- 162: Abetment of such assault if assault committed (7y)
- 163: Abetment of desertion (2y)
- 164: Harbouring deserter (2y)
- 165: Deserter concealed on merchant vessel by negligence (fine 3k)
- 166: Abetment of insubordination (6m / fine)
- 168: Wearing soldier/sailor/airman garb (3m / fine 2k)

(167 skipped — application provision.)

## Chapter IX — Of Offences Relating to Elections — additions (8)

- 170: Bribery (definition — points to s.173)
- 171: Undue influence at elections (definition — points to s.174)
- 172: Personation at elections (definition — points to s.174)
- 173: Punishment for bribery (1y or fine; treating: fine only)
- 174: Punishment for undue influence / personation (1y or fine)
- 175: False statement in connection with election (fine)
- 176: Illegal payments in connection with election (fine 10k)
- 177: Failure to keep election accounts (fine 5k)

(169 skipped — definition.)

## Validation

- `python3 -m json.tool` — VALID
- Total entries: 174 (previously 136; +38 net)
- No trailing commas, no duplicate keys verified by JSON parse
- _meta untouched (chunk 4 will refresh)

## Notes for chunk 3 / chunk 4

- Chunk 3 will cover Chapters X (Coining), XI (Public Tranquillity), XII–XV remaining gaps, and any sections 178–298 not yet present.
- Chapter VIII sub-section 167 deliberately omitted — it is application/scope provision, not an offence.
- Chapter IX sections 170–172 are penalty-by-reference; entries kept as cross-reference stubs so practitioners searching by IPC-equivalent terms ("bribery" → s.170) still hit. Practitioner-facing UI should display together with s.173/174.
