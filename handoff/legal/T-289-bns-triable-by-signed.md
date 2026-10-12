# T-289: court by which each BNS offence is triable (signed)

Ajay (CLO), 12 Oct 2026 IST. Source: BNSS 2023 First Schedule Part I, column 6, as printed (Gazette of India Extraordinary, 25 Dec 2023, CG-DL-E-25122023-250884, MHA copy). Keys match the signed `bns-offences.json` (T-277, `5f0ac29a…cb07de`).

## What the lead does (shashank, T-289, after T-277)

1. Add `apps/drafting/src/config/bns-triable-by.json` with the JSON block below, byte for byte. SHA-256 of the block text (between the fences, with its final newline): `aa68395db2643298041df1597697a280e939aefeecd3805c84bd77903f7bbc05`.
2. Bail-check and every other reader take the court **only** from this file. Delete the code that guesses the court from the maximum term (for example "3-7 years generally triable by Sessions Court", which is wrong: most of those are triable by a Magistrate).
3. Display: `Court: {triable_by}` as printed. `triable_by` null: `Court: Depends on the offence. Check the First Schedule.` A target resolves as in T-277 rule 3 (exact key, else parent row; with `variants`, use the sub-section's value; a variant that is null shows the Depends line).
4. Several charged sections: if any is `Court of Session`, the case goes there (`Court: Court of Session`); otherwise, if all are known, show the highest of `Magistrate of the first class` over `Any Magistrate`; if any is null or a reference ("Court by which offence abetted is triable"), show the Depends line unless one known section is `Court of Session`.
5. Reference values ("Court by which offence abetted is triable" and similar) are shown as printed for a single section; they never decide a multi-section result.
6. List changed test expectations and moved golden snapshots for me before merge.

## Marks

| Item | Mark |
|---|---|
| 275 sections with one court | Approved, as printed in the Schedule |
| 357, and the 356(3) and 356(4) variants | `null`, verify (Addendum 1) |
| 30 sections whose parts differ | `null` with `variants` or `lines`; Approved |
| 11 sections with no Schedule line (definitions and the like) | `null`; Approved |
| Later amendment of the Schedule | Not checked; follow-up with the India Code check in T-277 |

## The table (signed)

```json
{
  "_meta": {
    "description": "BNS offences: court by which triable, from the BNSS First Schedule Part I (Gazette of India Extraordinary, 25 Dec 2023, CG-DL-E-25122023-250884), column 6. Keys match bns-offences.json (T-277).",
    "validated_by": "Ajay (CLO) - 2026-10-12 - T-289; printed text of the Schedule, no inference from the term",
    "rule": "Show triable_by as printed. null means 'Court: Depends on the offence. Check the First Schedule.' Never infer the court from the maximum term.",
    "owner": "Ajay (CLO)",
    "change_protocol": "CLO sign-off required"
  },
  "offences": {
    "47": {
      "triable_by": null,
      "verify": "No line in the First Schedule for this section."
    },
    "48": {
      "triable_by": null,
      "verify": "No line in the First Schedule for this section."
    },
    "49": {
      "triable_by": "Court by which offence abetted is triable"
    },
    "50": {
      "triable_by": "Court by which offence abetted is triable"
    },
    "51": {
      "triable_by": "Court by which offence abetted is triable"
    },
    "52": {
      "triable_by": "Court by which offence abetted is triable"
    },
    "53": {
      "triable_by": "Court by which offence abetted is triable"
    },
    "54": {
      "triable_by": "Court by which offence abetted is triable"
    },
    "55": {
      "triable_by": "Court by which offence abetted is triable"
    },
    "56": {
      "triable_by": "Court by which offence abetted is triable"
    },
    "57": {
      "triable_by": "Court by which offence abetted is triable"
    },
    "58": {
      "triable_by": "Court by which offence abetted is triable"
    },
    "59": {
      "triable_by": "Court by which offence abetted is triable"
    },
    "60": {
      "triable_by": "Court by which offence abetted is triable"
    },
    "61": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "61(2)(a)": "Court by which abetment of the offence which is the object of conspiracy is triable",
        "61(2)(b)": "Magistrate of the first class"
      }
    },
    "62": {
      "triable_by": "The court by which the offence attempted is triable"
    },
    "63": {
      "triable_by": null,
      "verify": "No line in the First Schedule for this section."
    },
    "64": {
      "triable_by": "Court of Session"
    },
    "65": {
      "triable_by": "Court of Session"
    },
    "66": {
      "triable_by": "Court of Session"
    },
    "67": {
      "triable_by": "Court of Session"
    },
    "68": {
      "triable_by": "Court of Session"
    },
    "69": {
      "triable_by": "Court of Session"
    },
    "70": {
      "triable_by": "Court of Session"
    },
    "71": {
      "triable_by": "Court of Session"
    },
    "72": {
      "triable_by": "Any Magistrate"
    },
    "73": {
      "triable_by": "Any Magistrate"
    },
    "74": {
      "triable_by": "Any Magistrate"
    },
    "75": {
      "triable_by": "Court of Session"
    },
    "76": {
      "triable_by": "Court of Session"
    },
    "77": {
      "triable_by": "Court of Session"
    },
    "78": {
      "triable_by": "Any Magistrate"
    },
    "79": {
      "triable_by": "Any Magistrate"
    },
    "80": {
      "triable_by": "Court of Session"
    },
    "81": {
      "triable_by": "Magistrate of the first class"
    },
    "82": {
      "triable_by": "Magistrate of the first class"
    },
    "83": {
      "triable_by": "Magistrate of the first class"
    },
    "84": {
      "triable_by": "Any Magistrate"
    },
    "85": {
      "triable_by": "Magistrate of the first class"
    },
    "87": {
      "triable_by": "Court of Session"
    },
    "88": {
      "triable_by": "Magistrate of the first class"
    },
    "89": {
      "triable_by": "Court of Session"
    },
    "90": {
      "triable_by": "Court of Session"
    },
    "91": {
      "triable_by": "Court of Session"
    },
    "92": {
      "triable_by": "Court of Session"
    },
    "93": {
      "triable_by": "Magistrate of the first class"
    },
    "94": {
      "triable_by": "Magistrate of the first class"
    },
    "95": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "lines": [
        "Court by which offence committed is triable",
        "Magistrate of the first class"
      ]
    },
    "96": {
      "triable_by": "Court of Session"
    },
    "97": {
      "triable_by": "Magistrate of the first class"
    },
    "98": {
      "triable_by": "Court of Session"
    },
    "99": {
      "triable_by": "Court of Session"
    },
    "103": {
      "triable_by": "Court of Session"
    },
    "103(2)": {
      "triable_by": "Court of Session"
    },
    "104": {
      "triable_by": "Court of Session"
    },
    "105": {
      "triable_by": "Court of Session"
    },
    "106": {
      "triable_by": "Magistrate of the first class"
    },
    "106(2)": {
      "triable_by": "Magistrate of the first class"
    },
    "107": {
      "triable_by": "Court of Session"
    },
    "108": {
      "triable_by": "Court of Session"
    },
    "109": {
      "triable_by": "Court of Session"
    },
    "110": {
      "triable_by": "Court of Session"
    },
    "111": {
      "triable_by": "Court of Session"
    },
    "112": {
      "triable_by": "Magistrate of the first class"
    },
    "113": {
      "triable_by": "Court of Session"
    },
    "115": {
      "triable_by": "Any Magistrate"
    },
    "115(1)": {
      "triable_by": null,
      "verify": "No line in the First Schedule for this section."
    },
    "115(2)": {
      "triable_by": "Any Magistrate"
    },
    "117": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "117(2)": "Any Magistrate",
        "117(3)": "Court of Session",
        "117(4)": "Court of Session"
      }
    },
    "118": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "118(1)": "Any Magistrate",
        "118(2)": "Magistrate of the first class"
      }
    },
    "119": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "119(1)": "Magistrate of the first class",
        "119(2)": "Court of Session"
      }
    },
    "120": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "120(1)": "Magistrate of the first class",
        "120(2)": "Court of Session"
      }
    },
    "121": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "121(1)": "Magistrate of the first class",
        "121(2)": "Court of Session"
      }
    },
    "122": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "122(1)": "Any Magistrate",
        "122(2)": "Magistrate of the first class"
      }
    },
    "123": {
      "triable_by": "Court of Session"
    },
    "124": {
      "triable_by": "Court of Session"
    },
    "125": {
      "triable_by": "Any Magistrate"
    },
    "126": {
      "triable_by": "Any Magistrate"
    },
    "127": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "127(2)": "Any Magistrate",
        "127(3)": "Any Magistrate",
        "127(4)": "Magistrate of the first class",
        "127(5)": "Magistrate of the first class",
        "127(6)": "Magistrate of the first class",
        "127(7)": "Any Magistrate",
        "127(8)": "Any Magistrate"
      }
    },
    "127(3)": {
      "triable_by": "Any Magistrate"
    },
    "127(4)": {
      "triable_by": "Magistrate of the first class"
    },
    "127(7)": {
      "triable_by": "Any Magistrate"
    },
    "131": {
      "triable_by": "Any Magistrate"
    },
    "132": {
      "triable_by": "Any Magistrate"
    },
    "133": {
      "triable_by": "Any Magistrate"
    },
    "134": {
      "triable_by": "Any Magistrate"
    },
    "135": {
      "triable_by": "Any Magistrate"
    },
    "136": {
      "triable_by": "Any Magistrate"
    },
    "137": {
      "triable_by": "Magistrate of the first class"
    },
    "139": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "139(1)": "Magistrate of the first class",
        "139(2)": "Court of Session"
      }
    },
    "140": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "140(1)": "Court of Session",
        "140(2)": "Court of Session",
        "140(3)": "Magistrate of the first class",
        "140(4)": "Court of Session"
      }
    },
    "140(2)": {
      "triable_by": "Court of Session"
    },
    "141": {
      "triable_by": "Court of Session"
    },
    "142": {
      "triable_by": "Court by which the kidnapping or abduction is triable"
    },
    "143": {
      "triable_by": "Court of Session"
    },
    "144": {
      "triable_by": "Court of Session"
    },
    "145": {
      "triable_by": "Court of Session"
    },
    "146": {
      "triable_by": "Any Magistrate"
    },
    "147": {
      "triable_by": "Court of Session"
    },
    "148": {
      "triable_by": "Court of Session"
    },
    "149": {
      "triable_by": "Court of Session"
    },
    "150": {
      "triable_by": "Court of Session"
    },
    "151": {
      "triable_by": "Court of Session"
    },
    "152": {
      "triable_by": "Court of Session"
    },
    "153": {
      "triable_by": "Court of Session"
    },
    "154": {
      "triable_by": "Court of Session"
    },
    "155": {
      "triable_by": "Court of Session"
    },
    "156": {
      "triable_by": "Court of Session"
    },
    "157": {
      "triable_by": "Magistrate of the first class"
    },
    "158": {
      "triable_by": "Court of Session"
    },
    "159": {
      "triable_by": "Court of Session"
    },
    "160": {
      "triable_by": "Court of Session"
    },
    "161": {
      "triable_by": "Magistrate of the first class"
    },
    "162": {
      "triable_by": "Magistrate of the first class"
    },
    "163": {
      "triable_by": "Any Magistrate"
    },
    "164": {
      "triable_by": "Any Magistrate"
    },
    "165": {
      "triable_by": "Any Magistrate"
    },
    "166": {
      "triable_by": "Any Magistrate"
    },
    "168": {
      "triable_by": "Any Magistrate"
    },
    "170": {
      "triable_by": null,
      "verify": "No line in the First Schedule for this section."
    },
    "171": {
      "triable_by": null,
      "verify": "No line in the First Schedule for this section."
    },
    "172": {
      "triable_by": null,
      "verify": "No line in the First Schedule for this section."
    },
    "173": {
      "triable_by": "Magistrate of the first class"
    },
    "174": {
      "triable_by": "Magistrate of the first class"
    },
    "175": {
      "triable_by": "Magistrate of the first class"
    },
    "176": {
      "triable_by": "Magistrate of the first class"
    },
    "177": {
      "triable_by": "Magistrate of the first class"
    },
    "178": {
      "triable_by": "Court of Session"
    },
    "179": {
      "triable_by": "Court of Session"
    },
    "180": {
      "triable_by": "Court of Session"
    },
    "181": {
      "triable_by": "Court of Session"
    },
    "182": {
      "triable_by": "Any Magistrate"
    },
    "183": {
      "triable_by": "Magistrate of the first class"
    },
    "184": {
      "triable_by": "Any Magistrate"
    },
    "185": {
      "triable_by": "Magistrate of the first class"
    },
    "186": {
      "triable_by": "Any Magistrate"
    },
    "187": {
      "triable_by": "Magistrate of the first class"
    },
    "188": {
      "triable_by": "Magistrate of the first class"
    },
    "189": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "189(2)": "Any Magistrate",
        "189(3)": "Any Magistrate",
        "189(4)": "Any Magistrate",
        "189(5)": "Any Magistrate",
        "189(6)": "The Court by which the offence is triable",
        "189(7)": "Any Magistrate",
        "189(8)": "Any Magistrate",
        "189(9)": "Any Magistrate"
      }
    },
    "190": {
      "triable_by": "The Court by which the offence is triable"
    },
    "191": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "191(2)": "Any Magistrate",
        "191(3)": "Magistrate of the first class"
      }
    },
    "192": {
      "triable_by": "Any Magistrate"
    },
    "193": {
      "triable_by": "Any Magistrate"
    },
    "194": {
      "triable_by": "Any Magistrate"
    },
    "195": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "195(1)": "Magistrate of the first class",
        "195(2)": "Any Magistrate"
      }
    },
    "196": {
      "triable_by": "Magistrate of the first class"
    },
    "197": {
      "triable_by": "Magistrate of the first class"
    },
    "198": {
      "triable_by": "Magistrate of the first class"
    },
    "199": {
      "triable_by": "Magistrate of the first class"
    },
    "200": {
      "triable_by": "Magistrate of the first class"
    },
    "201": {
      "triable_by": "Magistrate of the first class"
    },
    "202": {
      "triable_by": "Magistrate of the first class"
    },
    "203": {
      "triable_by": "Magistrate of the first class"
    },
    "204": {
      "triable_by": "Any Magistrate"
    },
    "205": {
      "triable_by": "Any Magistrate"
    },
    "206": {
      "triable_by": "Any Magistrate"
    },
    "207": {
      "triable_by": "Any Magistrate"
    },
    "208": {
      "triable_by": "Any Magistrate"
    },
    "209": {
      "triable_by": "Magistrate of the first class"
    },
    "210": {
      "triable_by": "The Court in which the offence is committed, subject to the provisions of Chapter XXVIII; or, if not committed, in a Court, any Magistrate"
    },
    "211": {
      "triable_by": "Any Magistrate"
    },
    "212": {
      "triable_by": "Any Magistrate"
    },
    "213": {
      "triable_by": "The Court in which the offence is committed, subject to the provisions of Chapter XXVIII; or, if not committed, in a Court, any Magistrate"
    },
    "214": {
      "triable_by": "The Court in which the offence is committed, subject to the provisions of Chapter XXVIII; or, if not committed, in a Court, any Magistrate"
    },
    "215": {
      "triable_by": "The Court in which the offence is committed, subject to the provisions of Chapter XXVIII; or, if not committed, in a Court, any Magistrate"
    },
    "216": {
      "triable_by": "Magistrate of the first class"
    },
    "217": {
      "triable_by": "Any Magistrate"
    },
    "218": {
      "triable_by": "Any Magistrate"
    },
    "219": {
      "triable_by": "Any Magistrate"
    },
    "220": {
      "triable_by": "Any Magistrate"
    },
    "221": {
      "triable_by": "Any Magistrate"
    },
    "222": {
      "triable_by": "Any Magistrate"
    },
    "223": {
      "triable_by": "Any Magistrate"
    },
    "224": {
      "triable_by": "Any Magistrate"
    },
    "225": {
      "triable_by": "Any Magistrate"
    },
    "226": {
      "triable_by": "Any Magistrate"
    },
    "227": {
      "triable_by": null,
      "verify": "No line in the First Schedule for this section."
    },
    "228": {
      "triable_by": null,
      "verify": "No line in the First Schedule for this section."
    },
    "229": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "229(1)": "Magistrate of the first class",
        "229(2)": "Any Magistrate"
      }
    },
    "230": {
      "triable_by": "Court of Session"
    },
    "231": {
      "triable_by": "Court of Session"
    },
    "232": {
      "triable_by": "Court by which offence of giving false evidence is triable"
    },
    "233": {
      "triable_by": "Court by which offence of giving or fabricating false evidence is triable"
    },
    "234": {
      "triable_by": "Court by which offence of giving false evidence is triable"
    },
    "235": {
      "triable_by": "Court by which offence of giving false evidence is triable"
    },
    "236": {
      "triable_by": "Court by which offence of giving false evidence is triable"
    },
    "237": {
      "triable_by": "Court by which offence of giving false evidence is triable"
    },
    "238": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "238(a)": "Court of Session",
        "238(b)": "Magistrate of the first class",
        "238(c)": "Court by which the offence is triable"
      }
    },
    "238(a)": {
      "triable_by": "Court of Session"
    },
    "238(b)": {
      "triable_by": "Magistrate of the first class"
    },
    "239": {
      "triable_by": "Any Magistrate"
    },
    "240": {
      "triable_by": "Any Magistrate"
    },
    "241": {
      "triable_by": "Magistrate of the first class"
    },
    "242": {
      "triable_by": "Magistrate of the first class"
    },
    "243": {
      "triable_by": "Any Magistrate"
    },
    "244": {
      "triable_by": "Any Magistrate"
    },
    "245": {
      "triable_by": "Magistrate of the first class"
    },
    "246": {
      "triable_by": "Magistrate of the first class"
    },
    "247": {
      "triable_by": "Magistrate of the first class"
    },
    "248": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "248(a)": "Magistrate of the first class",
        "248(b)": "Court of Session"
      }
    },
    "249": {
      "triable_by": "Magistrate of the first class"
    },
    "250": {
      "triable_by": "Magistrate of the first class"
    },
    "251": {
      "triable_by": "Magistrate of the first class"
    },
    "252": {
      "triable_by": "Magistrate of the first class"
    },
    "253": {
      "triable_by": "Magistrate of the first class"
    },
    "254": {
      "triable_by": "Magistrate of the first class"
    },
    "255": {
      "triable_by": "Any Magistrate"
    },
    "256": {
      "triable_by": "Magistrate of the first class"
    },
    "257": {
      "triable_by": "Magistrate of the first class"
    },
    "258": {
      "triable_by": "Magistrate of the first class"
    },
    "259": {
      "triable_by": "Magistrate of the first class"
    },
    "260": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "260(a)": "Court of Session",
        "260(b)": "Magistrate of the first class",
        "260(c)": "Magistrate of the first class"
      }
    },
    "261": {
      "triable_by": "Any Magistrate"
    },
    "262": {
      "triable_by": "Any Magistrate"
    },
    "263": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "263(a)": "Any Magistrate",
        "263(b)": "Magistrate of the first class",
        "263(c)": "Magistrate of the first class",
        "263(d)": "Magistrate of the first class",
        "263(e)": "Court of Session"
      }
    },
    "264": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "lines": [
        "Any Magistrate",
        "Magistrate of the first class"
      ]
    },
    "265": {
      "triable_by": "Any Magistrate"
    },
    "266": {
      "triable_by": "The Court by which the original offence was triable"
    },
    "267": {
      "triable_by": "The Court in which the offence is committed, subject to the provisions of Chapter XXVIII; or, if not committed, in a Court, any Magistrate"
    },
    "268": {
      "triable_by": "Magistrate of the first class"
    },
    "269": {
      "triable_by": "Any Magistrate"
    },
    "270": {
      "triable_by": null,
      "verify": "No line in the First Schedule for this section."
    },
    "271": {
      "triable_by": "Any Magistrate"
    },
    "272": {
      "triable_by": "Any Magistrate"
    },
    "273": {
      "triable_by": "Any Magistrate"
    },
    "274": {
      "triable_by": "Any Magistrate"
    },
    "275": {
      "triable_by": "Any Magistrate"
    },
    "276": {
      "triable_by": "Any Magistrate"
    },
    "277": {
      "triable_by": "Any Magistrate"
    },
    "278": {
      "triable_by": "Any Magistrate"
    },
    "279": {
      "triable_by": "Any Magistrate"
    },
    "280": {
      "triable_by": "Any Magistrate"
    },
    "281": {
      "triable_by": "Any Magistrate"
    },
    "282": {
      "triable_by": "Any Magistrate"
    },
    "283": {
      "triable_by": "Magistrate of the first class"
    },
    "284": {
      "triable_by": "Any Magistrate"
    },
    "285": {
      "triable_by": "Any Magistrate"
    },
    "286": {
      "triable_by": "Any Magistrate"
    },
    "287": {
      "triable_by": "Any Magistrate"
    },
    "288": {
      "triable_by": "Any Magistrate"
    },
    "289": {
      "triable_by": "Any Magistrate"
    },
    "290": {
      "triable_by": "Any Magistrate"
    },
    "291": {
      "triable_by": "Any Magistrate"
    },
    "292": {
      "triable_by": "Any Magistrate"
    },
    "293": {
      "triable_by": "Any Magistrate"
    },
    "294": {
      "triable_by": "Any Magistrate"
    },
    "295": {
      "triable_by": "Any Magistrate"
    },
    "296": {
      "triable_by": "Any Magistrate"
    },
    "297": {
      "triable_by": "Any Magistrate"
    },
    "298": {
      "triable_by": "Any Magistrate"
    },
    "299": {
      "triable_by": "Magistrate of the first class"
    },
    "300": {
      "triable_by": "Any Magistrate"
    },
    "301": {
      "triable_by": "Any Magistrate"
    },
    "302": {
      "triable_by": "Any Magistrate"
    },
    "303": {
      "triable_by": "Any Magistrate"
    },
    "303(2)": {
      "triable_by": "Any Magistrate"
    },
    "304": {
      "triable_by": "Any Magistrate"
    },
    "305": {
      "triable_by": "Any Magistrate"
    },
    "306": {
      "triable_by": "Any Magistrate"
    },
    "307": {
      "triable_by": "Magistrate of the first class"
    },
    "308": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "308(2)": "Magistrate of the first class",
        "308(3)": "Any Magistrate",
        "308(4)": "Magistrate of the first class",
        "308(5)": "Magistrate of the first class",
        "308(6)": "Magistrate of the first class",
        "308(7)": "Magistrate of the first class"
      }
    },
    "309": {
      "triable_by": "Magistrate of the first class"
    },
    "310": {
      "triable_by": "Court of Session"
    },
    "310(6)": {
      "triable_by": "Court of Session"
    },
    "311": {
      "triable_by": "Court of Session"
    },
    "312": {
      "triable_by": "Court of Session"
    },
    "313": {
      "triable_by": "Magistrate of the first class"
    },
    "314": {
      "triable_by": "Any Magistrate"
    },
    "315": {
      "triable_by": "Magistrate of the first class"
    },
    "316": {
      "triable_by": "Magistrate of the first class"
    },
    "317": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "317(2)": "Any Magistrate",
        "317(3)": "Court of Session",
        "317(4)": "Court of Session",
        "317(5)": "Any Magistrate"
      }
    },
    "318": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "318(2)": "Any Magistrate",
        "318(3)": "Any Magistrate",
        "318(4)": "Magistrate of the first class"
      }
    },
    "318(3)": {
      "triable_by": "Any Magistrate"
    },
    "318(4)": {
      "triable_by": "Magistrate of the first class"
    },
    "319": {
      "triable_by": "Any Magistrate"
    },
    "320": {
      "triable_by": "Any Magistrate"
    },
    "321": {
      "triable_by": "Any Magistrate"
    },
    "322": {
      "triable_by": "Any Magistrate"
    },
    "323": {
      "triable_by": "Any Magistrate"
    },
    "324": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "324(2)": "Any Magistrate",
        "324(3)": "Any Magistrate",
        "324(4)": "Any Magistrate",
        "324(5)": "Magistrate of the first class",
        "324(6)": "Magistrate of the first class"
      }
    },
    "324(4)": {
      "triable_by": "Any Magistrate"
    },
    "325": {
      "triable_by": "Magistrate of the first class"
    },
    "326": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "326(a)": "Magistrate of the first class",
        "326(b)": "Magistrate of the first class",
        "326(c)": "Magistrate of the first class",
        "326(d)": "Magistrate of the first class",
        "326(e)": "Any Magistrate",
        "326(f)": "Magistrate of the first class",
        "326(g)": "Court of Session"
      }
    },
    "326(b)": {
      "triable_by": "Magistrate of the first class"
    },
    "326(d)": {
      "triable_by": "Magistrate of the first class"
    },
    "327": {
      "triable_by": "Court of Session"
    },
    "328": {
      "triable_by": "Court of Session"
    },
    "329": {
      "triable_by": "Any Magistrate"
    },
    "331": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "331(1)": "Any Magistrate",
        "331(2)": "Any Magistrate",
        "331(3)": null,
        "331(4)": null,
        "331(5)": "Magistrate of the first class",
        "331(6)": "Magistrate of the first class",
        "331(7)": "Court of Session",
        "331(8)": "Court of Session"
      }
    },
    "332": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "332(a)": "Court of Session",
        "332(b)": "Court of Session",
        "332(c)": "Any Magistrate"
      }
    },
    "333": {
      "triable_by": "Any Magistrate"
    },
    "334": {
      "triable_by": "Any Magistrate"
    },
    "336": {
      "triable_by": "Magistrate of the first class"
    },
    "336(2)": {
      "triable_by": "Magistrate of the first class"
    },
    "337": {
      "triable_by": "Magistrate of the first class"
    },
    "338": {
      "triable_by": "Magistrate of the first class"
    },
    "339": {
      "triable_by": "Magistrate of the first class"
    },
    "340": {
      "triable_by": "Magistrate of the first class"
    },
    "341": {
      "triable_by": "Magistrate of the first class"
    },
    "342": {
      "triable_by": "Magistrate of the first class"
    },
    "343": {
      "triable_by": "Magistrate of the first class"
    },
    "344": {
      "triable_by": "Magistrate of the first class"
    },
    "345": {
      "triable_by": "Any Magistrate"
    },
    "346": {
      "triable_by": "Any Magistrate"
    },
    "347": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "347(1)": "Any Magistrate",
        "347(2)": "Magistrate of the first class"
      }
    },
    "348": {
      "triable_by": "Magistrate of the first class"
    },
    "349": {
      "triable_by": "Any Magistrate"
    },
    "350": {
      "triable_by": "Any Magistrate"
    },
    "351": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "351(2)": "Any Magistrate",
        "351(3)": "Magistrate of the first class",
        "351(4)": "Magistrate of the first class"
      }
    },
    "352": {
      "triable_by": "Any Magistrate"
    },
    "353": {
      "triable_by": "Any Magistrate"
    },
    "353(1)": {
      "triable_by": "Any Magistrate"
    },
    "354": {
      "triable_by": "Any Magistrate"
    },
    "355": {
      "triable_by": "Any Magistrate"
    },
    "356": {
      "triable_by": null,
      "verify": "The First Schedule gives different courts for parts of this section.",
      "variants": {
        "356(2)": null,
        "356(3)": null,
        "356(4)": null
      }
    },
    "356(1)": {
      "triable_by": null,
      "verify": "No line in the First Schedule for this section."
    },
    "357": {
      "triable_by": null,
      "verify": "Printed court not confirmed; check against India Code."
    }
  }
}
```

## Addendum 1 (12 Oct 2026 IST): extraction fixes

Shashank found three values that were extraction errors, not Schedule text: 356(3) and 356(4) ("of Session. of the first") and 357 ("Magistrate"). All three are now null, so the screen shows the Depends line. Each is **verify** against India Code; I will send real values in a later addendum if confirmed. New SHA: `aa68395db2643298041df1597697a280e939aefeecd3805c84bd77903f7bbc05`. No other row changed.
