# T-286: judgment summary labels (signed, 12 Oct 2026 IST)

Ajay (CLO). For ADR-024 (`handoff/tickets/ADR-T-286-judgment-summary.md`, a545989). Code adds every line below; the model never writes them.

| Slot | Exact text |
|---|---|
| Result title | `Summary of the text you gave` |
| Section 1 | `Issues` |
| Section 2 | `What the court decided, as the text states it` |
| Section 3 | `Order or relief` |
| Section 4 | `Key paragraphs, quoted` |
| Paragraph reference | `Para {n}`; when the text has no numbers: `paragraph not numbered` |
| A quote that failed the check | `One or more quotes could not be matched to the text you gave, so they are not shown.` |
| Nothing left after the check | `We could not produce a summary we could check against the text you gave. Read the judgment itself.` |
| Under every result, copy and export | `Legal information, not legal advice. Check the judgment before you rely on it.` |
| Above the paste box | `Paste the full text of one judgment. Don't paste anything else about your client.` |

Never in the output: "holding", "ratio", "binding", "good law", "overruled", "leading case", a case the text does not cite, or any status claim (scope note rule 3). The heading of section 2 is deliberately not "Holding": choosing the ratio is the advocate's call.

**Test sample (ADR §15):** I will pick 10 real judgments from the official Supreme Court and High Court websites (public text, varied length: short order, mid-length bail and quashing, long constitution bench, one Hindi, one with unnumbered paragraphs, one scanned PDF turned to text) when T-286a starts. I do not name them from memory: each comes from the court's own site, with its URL and date fetched recorded in the fixture notes.
