# T-361 AC2: corrected theft rows 303 and 303(2), pending (signed)

Signed: Ajay (CLO), 13 Oct 2026 IST. The ruling is final. Only the landing waits: these rows go into the T-277 signed table and into `apps/drafting/src/config/bns-offences.json` in **one commit**, once the founder approves Shashank's permission prompt. Until then the T-277 table stays as it was, so CI stays green.

## What changes

In the T-277 JSON block, rows `"303"` and `"303(2)"` only:

- Top-level `punishment`: `Up to 3 years, or fine, or both. On a second or later conviction: rigorous imprisonment of 1 to 5 years, and fine.`
- Insert a new field `note` right after `punishment`: `Where the property is worth less than ₹5,000, it is a first conviction, and the property is returned or its value restored, the punishment is community service.`
- `max_years`: `3` (was `5`).
- Variant `303(2)` `punishment`: `Community service, where it is a first conviction and the property is returned or its value restored.`
- Nothing else changes.

After the change, the T-277 block's SHA-256 (between the fences, final newline included) must be `bc0c62931faf0a343460d8a8fdb94ea91306c019943ec609aaf71a61a3d43e9c`. Update step 1's SHA in the T-277 file to match.

## The two rows, exactly as they must read

```json
    "303": {
      "title": "Theft",
      "punishment": "Up to 3 years, or fine, or both. On a second or later conviction: rigorous imprisonment of 1 to 5 years, and fine.",
      "note": "Where the property is worth less than ₹5,000, it is a first conviction, and the property is returned or its value restored, the punishment is community service.",
      "max_years": 3,
      "bailable": null,
      "cognizable": null,
      "compoundable": true,
      "chapter": "XVII — Of Offences Against Property",
      "verify": "bailable: differs by sub-section, see variants; cognizable: differs by sub-section or is conditional, see variants. Set to null.",
      "variants": {
        "303(2)": {
          "offence": "Theft. Where value of property is less than 5,000 rupees.",
          "punishment": "Community service, where it is a first conviction and the property is returned or its value restored.",
          "cognizable": "yes; no",
          "bailable": "no; yes",
          "compoundable": "yes"
        }
      }
    },
    "303(2)": {
      "title": "Theft",
      "punishment": "Up to 3 years, or fine, or both. On a second or later conviction: rigorous imprisonment of 1 to 5 years, and fine.",
      "note": "Where the property is worth less than ₹5,000, it is a first conviction, and the property is returned or its value restored, the punishment is community service.",
      "max_years": 3,
      "bailable": null,
      "cognizable": null,
      "compoundable": true,
      "chapter": "XVII — Of Offences Against Property",
      "verify": "bailable: differs by sub-section, see variants; cognizable: differs by sub-section or is conditional, see variants. Set to null.",
      "variants": {
        "303(2)": {
          "offence": "Theft. Where value of property is less than 5,000 rupees.",
          "punishment": "Community service, where it is a first conviction and the property is returned or its value restored.",
          "cognizable": "yes; no",
          "bailable": "no; yes",
          "compoundable": "yes"
        }
      }
    }
```
