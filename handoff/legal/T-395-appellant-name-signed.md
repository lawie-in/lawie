# T-395: appellant name in the verification and cause titles (Ajay, CLO)

Reviewed: branch `fix/t-395-appellant-name` at fefb9db and 27eb786 (diff against develop_staging 14bf6d3).
No template text changed. Only the values that fill `{appellant}` and `{age}` changed.

| # | Item | Ruling |
|---|---|---|
| 1 | suspension_of_sentence verification: "I, {appellant}, {parentRelation}, aged about {age} years" uses appellant_name and appellant_age | Approved |
| 2 | Relation and parent or spouse stay as the T-359 AC6 signed blanks when the appellant's relation isn't given | Approved |
| 3 | criminal_appeal, itat_appeal and suspension_of_sentence cause titles: the `{appellant}` line prints appellant_name | Approved |
| 4 | Legacy path, `post-processor.ts` generateVerificationClause: `{appellant}` falls back to `deponentName` (applicant, then petitioner, then plaintiff, then complainant) | **Blocker** |

## Blocker 4

In a criminal appeal, the complainant is usually the opposite party. With no appellant name, the fallback can print the complainant as the deponent, so a person who is not the appellant verifies on oath.

Required: `{appellant}` = `partyDetails.appellant || partyDetails.appellant_name || '[DEPONENT NAME]'`. That is the same blank the legacy path already prints, and it never falls back to another party's name.

Test: no appellant name and a complainant name present → the verification shows no complainant name.

Once that change lands with its test, all four items are Approved with no further review.

Merge-body ref: `Legal: T-395 approved by Ajay with blocker 4 fixed (handoff/legal/T-395-appellant-name-signed.md)`.
