# T-334: "none filed" phrasings for earlier bail applications (signed)

Signed: Ajay (CLO), 12 Oct 2026 IST. File: `_averments/bail_regular.json`, entry `first_bail_application` (both blocks: the banned entry at `phrases` / `unlocked_by.equals`, and the allowed entry at `requires.equals`). The other bail packs inherit it.

Add these lines exactly as written, after the existing ones, in this order. Change nothing else.

## A. Answers that mean "none filed" (append to both `equals` lists)

Whole-answer match, after the existing folding (case, spaces and punctuation).

```text
none filed
not filed
never filed
nothing filed
no bail application
no bail application filed
no bail application has been filed
no earlier bail application
no previous bail application
no previous application
no other bail application
first bail application
this is the first bail application
koi bail nahi
koi bail nahi lagayi
koi zamanat nahi
koi zamanat arzi nahi
koi arzi nahi
pehli zamanat arzi
pehli bail application
कोई नहीं
कोई जमानत अर्जी नहीं
पहली जमानत अर्जी
```

## B. Draft phrasings that claim no earlier application (append to `phrases`)

```text
no earlier bail application has been filed
no previous bail application has been filed
no bail application has been filed
no other bail application has been filed
no other bail application has been made
no bail application is pending
the applicant has not filed any other bail application
the applicant has not filed any bail application
this is the first application for bail
this is the applicant's first bail application
the present is the first bail application
koi zamanat arzi nahi lagayi gayi
```

## Not added, on purpose

- "pehli baar" and a bare "nahi lagayi": too ambiguous ("first time" may mean the first arrest).
- Any phrasing that names a court or a date: that is an earlier application, not "none".

## Tests (AC2)

- Each line in A, typed as the answer, counts as "none filed": `first_bail_application` unlocks and no "earlier bail applications are:" line prints.
- "rejected by Sessions Court on 2 Sep" still prints as an earlier application.
- Each line in B appearing in a draft without a confirmed "none" is stripped by the verifier, or raises the T-341 warning.
- The `_averments` hash changes. Send me the new hash and I sign it.
