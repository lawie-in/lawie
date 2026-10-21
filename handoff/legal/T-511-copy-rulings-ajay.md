# T-511 UI copy rulings (Ajay, 17 Oct 2026)

| Ref | Line | Ruling |
|---|---|---|
| AJ-511-M1 | `You see the Ink cost before you generate.` | Signed, on one condition: T-388 AC4 is live, and the cost shown is always the cost charged. If the cost can change after it is shown, strike the line. |
| AJ-511-M2 | `If a draft fails to generate, no Ink is used.` | Signed in this wording, which replaces "A failed generation is not charged". Use the same line everywhere, previews included. The condition is that billing never debits Ink for a failed generation, or refunds it automatically with no request needed (Arjun confirms). |
| AJ-511-M3 | Sign-up with an email that already has an account: show the same screen as a new sign-up, `We've sent a link to {email}. Open it to continue.` | Signed. The page never says that an account exists. The email to the existing account says: `Someone tried to create a Lawie account with this email. If it was you, sign in or reset your password. If not, you can ignore this email.` The same neutral rule applies as in T-221 (423b0551). |

The final file still comes to me for sign-off.

## Sign-off on handoff/copy/T-511-copy-v1.md @ 5d292d3 (Ajay, 17 Oct 2026)

| Ref | Item | Ruling |
|---|---|---|
| AJ-511-M4 | [AJAY TO SIGN] "cost before" lines (1.4 step 2, 1.6 intro, FAQ Q1, low-Ink banner) | Signed as written, under the M1 condition. |
| AJ-511-M5 | [AJAY TO SIGN] "A failed generation is not charged" (1.6, FAQ Q1, FAQ Q3) | Amended everywhere to `If a draft fails to generate, no Ink is used.` (M2). Hindi 1.6 `जो ड्राफ़्ट पूरा नहीं बनता, उसका Ink नहीं कटता।` is signed. Error row 449 is amended to `The draft did not finish. No Ink was used.` |
| AJ-511-M6 | [AJAY TO RULE] sign-up, existing email (2.4, row 294) | Amended to M3: `We've sent a link to {email}. Open it to continue.` Use the same screen for new and existing emails. |
| AJ-511-M7 | Free Ink "(lifetime)" | Amended to `(one time)`, and the Hindi `(जीवनभर के लिए)` to `(एक बार)`. |
| AJ-511-M8 | "Top-up Ink never expires" | Amended to `Top-up Ink does not expire while your account is open.` The same in Hindi: `खाता चालू रहने तक टॉप-अप Ink समाप्त नहीं होता।`. Vikram confirms. |
| AJ-511-M9 | 500 page "Your drafts are safe." | Struck: it is a safety promise. Use no extra line. |
| AJ-511-M10 | AI down "Your documents are still here." | Amended to `Your saved documents are still in your account.` Keep it only if true. |
| AJ-511-M11 | Consent (row 270) | Amended to `I have read and agree to the Terms and the Privacy Policy (version {version}, {date}).`. The box must be unticked by default, and the version and date are stored with the consent. |
| AJ-511-M12 | Grievance line (523) | `Grievance Officer: {name}, {email}. We acknowledge within 24 hours and resolve within 15 days.` (IT Rules 2021, r.3(2)). Check against the DPDP Rules timelines: **verify**. |
| AJ-511-M13 | Privacy paragraph 1.7 and FAQ Q5 | Signed. In Q5, keep "from Settings" only if access, correct and erase are live. Otherwise use `write to our Grievance Officer` only. |
| AJ-511-M14 | Vendor examples (section 6) | OK as examples (Anthropic, USA; Razorpay, India). The live list comes from my vendor register before launch. |
| AJ-511-M15 | Checks panel lines (1.4 step 3, 1.7 para 2) | Signed, and they match the panel. |
| AJ-511-M16 | Other [CHECK] items (Free gating, export on Free, description stays, password rule, resend limit, email change, plan switch, default court) | These are product facts, not legal. Each line ships only if Priya confirms it is true in the build. "Do not write verified next to enrollment" is agreed. |
| AJ-511-M17 | Demo text | The scripted bail demo must use placeholders and no sections. I see the final text before launch. Fix the custody-days mismatch from the previews. |
| AJ-511-M18 | Landing claims overall, and the Hindi lines given | Signed, subject to M4 to M17. No accuracy, speed or "AI lawyer" claims were found. The Hindi FAQ comes to me after translation. |

| AJ-511-M19 | Madhuri's Hindi lines: 1.6 intro, 1.4 step 2 and the Low banner | Signed as written, under the same M1 and M2 (Arjun) conditions. |

## T-509 Settings plan chooser (Ajay, 17 Oct 2026)

| Ref | Item | Ruling |
|---|---|---|
| AJ-509-M1 | t433 "carry over" allowlist | Add exactly two strings: `Plan Ink does not carry over.` and `Plan Ink does not carry over after that.`. Nothing broader. The Resend-email feedback reuses the signed VERIFY_STRINGS (sent, already, limitWait, networkError). |
| AJ-509-M2 | past_due banner without a retry action | Until billing ships retry, show: `Your last payment did not go through. For help, write to {support email}.` When retry ships, go back to the §4.5 line with a "Retry payment" button. |
| AJ-509-M3 | "Redirecting you to the dashboard…" on success and on timeout | OK, as a neutral status line. |

## T-517 landing, pricing, sign-up and login: build vs signed copy (Ajay, 21 Oct 2026)

| Ref | Point | Ruling |
|---|---|---|
| AJ-517-M1 | Existing-email sign-up returns 409 | OK for v1 with today's signed 409 handling. The page saying an account exists is an enumeration risk. Priya opens a v1.1 backend ticket to make M3 true (same screen for both). |
| AJ-517-M2 | "Verify your email to sign in…" | Do not use it, because it is untrue. |
| AJ-517-M3 | Consent checkbox | OK as built: unticked, the M11 line, and it gates both Create account and Google. The error is signed: `Please accept the Privacy Policy and Terms to continue.`. The version and date belong to the Privacy Policy only. If the Terms carry their own version, show both: `I have read and agree to the Terms (version {tv}) and the Privacy Policy (version {pv}, {date}).`. The server stores what was shown. |
| AJ-517-M4 | Password line | Keep the existing signed checklist, which is true. |
| AJ-517-M5 | Pricing page | OK: only §1.6, §4.1, the T-398 Pro card strings and the GST FAQ. Drop the "2 Ink" lines. Use M2 and M8 for failed drafts and top-up. |
| AJ-517-M6 | Hero: `Describe the matter. Lawie writes the first draft.` | Legally OK. The final choice is Meera's. |
| AJ-517-M7 | Demo folio | OK: the signed prompt, the caption and an empty folio. No legal text until I sign the demo text. |
| AJ-517-M8 | Grievance officer | I have no signed name or email. IT Rules 2021 require the Grievance Officer's name and contact to be published. The footer may link to the privacy page's grievance section only if that section has a real name and email. If they are placeholders, it is a **launch blocker** for the founder to supply. |
| AJ-517-M9 | Other auth messages | Keep the existing signed T-234, T-299 and T-319 strings. |
| AJ-517-M10 | Hindi FAQ | OK for v1: the English FAQ shows in Hindi mode until the Hindi is translated and signed. |

## Grievance Officer line, ref AJ-517-M11 (Ajay, 21 Oct 2026)

- (a) The name is mandatory. IT Rules 2021, r.3(2)(a), require the name of the Grievance Officer and their contact details to be published. As a sole proprietorship, Lawie may name the proprietor. The name lives in config only, never in handoff files.
- (b) Signed line, for the footer section and the privacy policy:

  `Grievance Officer: {name}. Email: contact@lawie.in. We acknowledge every complaint within 24 hours and resolve it within 15 days.`

- Until a name is supplied, the line is not published and the launch blocker stays open. The email may appear alone only as `For complaints, write to contact@lawie.in.`. That does not satisfy the rule.

| Ref | Point | Ruling |
|---|---|---|
| AJ-517-M12 | t433 allowlist | Add exactly two more signed strings, with the HI of the first: `Plan Ink does not carry over to the next month.` and `Plan Ink left unused at the end of the month does not carry over.`. Nothing broader. |
| AJ-517-M13 | §1.7 with no officer name configured | Use the M11 fallback `For complaints, write to contact@lawie.in.`. Once a name is configured, use the M11 line. The FAQ cuts under M16 are OK. The consent line with the Privacy version only is OK, because it is the M11 wording when the Terms have no version. |
