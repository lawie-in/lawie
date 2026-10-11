# T-235 — Privacy policy covers Google sign-in data and where data is stored

| Field          | Value |
| -------------- | ----- |
| Phase          | 0 — Prep |
| Owner          | Ajay (text, signs), Arjun (where data is stored, facts), Lead (build), Anushka (verdict) |
| Mode           | Text first (Ajay), then build, small fix (web) |
| Status         | To do. Waits for Ajay's text and Arjun's facts |
| Size           | Ajay S. Build XS |
| Depends on     | T-220 (email provider line, Ajay's T-225 AC2) |
| Gate           | Before v1 go-live (T-403) |
| Branch         | fix/t-235-privacy-policy |
| Legal sign-off | Ajay signs the text |
| Created        | 2026-10-11 |
| Source         | Ajay, T-234 consent ruling, 11 Oct 2026 |

## Problem

`/privacy` says nothing about the data Lawie gets from Google sign-in, or about where user data is stored. The new consent line points users to it.

## Acceptance criteria

1. Arjun states the facts: what Google sign-in gives us, and where data and backups are stored (region, providers).
2. Ajay writes and signs the new sections, plus the email provider line from T-225.
3. The lead updates `/privacy` and, if Ajay says so, bumps `termsVersion`.
