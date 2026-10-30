# T-695b: Self-host Google Fonts' own subset woff2 files

Status: backlog (blocked on Ajay AJ-695b). Raised 30 Oct 2026 by Priya from Arjun's T-695 ruling.

Why: T-695 made CI resilient instead of self-hosting, because the official unmodified TTFs come to 951 KB on first load (fails T-584). Google Fonts serves subset woff2 files of the same OFL fonts that are much smaller.

Gate: Ajay rules AJ-695b, i.e. whether Google's served subset woff2 files count as acceptable distribution of the same OFL fonts (the RFN rules govern renaming, not format). If no, this ticket closes.

## Acceptance criteria
1. Serve Inter, Lora, Mukta, Tiro Devanagari Hindi and Fraunces with next/font/local from the Google-served subset woff2 files; the build fetches no fonts.
2. Fonts on first load ≤350 KB; Lighthouse mobile ≥85 (Arjun).
3. OFL.txt next to each family, with the source URL, the date and the SHA-256 of each file (Ajay AJ-695).
4. The rendered font is unchanged; Rajesh confirms with one screenshot.
5. Starts from Tanvi's parked branch fix/t-695-self-host-font.
