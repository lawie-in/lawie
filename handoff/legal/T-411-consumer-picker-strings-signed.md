# T-411: consumer court picker strings (Ajay, CLO, 13 Oct 2026)

Source: `handoff/marketing/consumer-court-picker-spec-t411.md`, strings table (Madhuri, 13 Oct). Each of the five strings below is signed exactly as written.

| Key | String | Ruling |
|---|---|---|
| `level.group_label` | Which Commission? | Approved |
| `level.district` | District Commission | Approved. The short form of the District Consumer Disputes Redressal Commission under the Consumer Protection Act, 2019. |
| `level.state` | State Commission | Approved |
| `level.national` | National Commission (NCDRC) | Approved |
| `court.ncdrc_option` | National Consumer Disputes Redressal Commission (NCDRC), New Delhi | Approved |
| `court.no_match` | No Commission is listed for this state yet. | Approved |

The four `live.*` lines name no forum, so they need no legal sign-off.

Conditions:
- The chips name only the level. The court record supplies the full Commission name that prints in the document (T-410 Addendum 1), never the chip text.
- The NCDRC option is never pre-selected (ADR-021 rule 3, as the spec says).
