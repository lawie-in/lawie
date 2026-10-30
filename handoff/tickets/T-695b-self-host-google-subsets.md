# T-695b: Self-host Google Fonts' own subset woff2 files

Status: backlog. AJ-695b ruled 30 Oct 2026: no for fonts with a Reserved Font Name, yes for the rest. Subsetting or format conversion makes a Modified Version, which may not carry an RFN without the holder's permission, and Google serving the subsets gives no such permission. Rule, per font: read its OFL.txt. If it names an RFN (Lora; check the others), use upstream release files only (AJ-695). If it has no RFN, Google's subset woff2 is fine. Raised 30 Oct 2026 by Priya from Arjun's T-695 ruling.

Why: T-695 made CI resilient instead of self-hosting, because the official unmodified TTFs come to 951 KB on first load (fails T-584). Google Fonts serves subset woff2 files of the same OFL fonts that are much smaller.

Gate: Ajay rules AJ-695b, i.e. whether Google's served subset woff2 files count as acceptable distribution of the same OFL fonts (the RFN rules govern renaming, not format). If no, this ticket closes.

## Acceptance criteria
1. List each font's RFN status from its OFL.txt (Ajay checks the list). Serve only the no-RFN fonts with next/font/local from the Google-served subset woff2 files; the RFN fonts stay on next/font/google; 
2. Fonts on first load ≤350 KB; Lighthouse mobile ≥85 (Arjun).
3. OFL.txt and the notices next to each family, with the source URL, the date and the SHA-256 of each file (Ajay AJ-695).
4. The rendered font is unchanged; Rajesh confirms with one screenshot.
5. Starts from Tanvi's parked branch fix/t-695-self-host-fonts @ 81947995.
6. T-695's test that mirrors the layouts' next/font/google calls must be relaxed (or dropped) for any font that moves to next/font/local (Tanvi).
