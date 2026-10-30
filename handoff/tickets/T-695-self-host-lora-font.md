# T-695: Stop the web build failing on the Google font fetch

Status: backlog (small). Raised 30 Oct 2026 by Priya. CI runs 1540 and 1549 both went red on "Web build" because `next build` could not fetch the Google font Lora (module-not-found in lora_*.module.css); both passed on re-run. Earlier flakes too.

## Acceptance criteria
1. Serve Lora (and any other next/font/google font) from the repo with next/font/local, so the build never fetches fonts over the network.
2. The rendered font is unchanged (same weights and styles). Rajesh confirms with one screenshot.
3. Check the font licence (Lora is SIL OFL) and keep the licence file next to the font files.
4. The web build passes with no network access to fonts.googleapis.com.
