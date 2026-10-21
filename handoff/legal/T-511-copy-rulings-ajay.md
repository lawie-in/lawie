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
| AJ-517-M13 | §1.7 with no officer name configured | Use the M11 fallback `For complaints, write to contact@lawie.in.`. Once a name is configured, use the M11 line. The FAQ cuts under M16 are OK. The consent line with the Privacy version only is OK, because it is the M11 wording when the Terms have no version. **Superseded by AJ-517-M16:** the Terms do have a version. |

| Ref | Point | Ruling |
|---|---|---|
| AJ-517-M14 | Privacy page §11 | Signed rewording: `For privacy questions, rights requests, grievances and general support, write to contact@lawie.in.` Then the M11 Grievance Officer line once a name is configured. With no name, print nothing more, because the first line already gives the address. |
| AJ-517-M15 | Privacy page §7 "Your Rights" (corrected from §10 by AJ-517-M17) | Change privacy@lawie.in to contact@lawie.in, so there is one address across the site. Priya extends the claim to that line. No page may name privacy@lawie.in unless that mailbox exists and is monitored. |

| Ref | Point | Ruling |
|---|---|---|
| AJ-517-M16 | Sign-up consent line (the Terms have their own version) | Signed: `I have read and agree to the Terms (version {terms version}) and the Privacy Policy (version {privacy version}).` Each version is read from its constant (Terms from the auth service, Privacy from shared), and a test pins each one. Drop the date, because the version already is a date. The box stays unticked by default. |
| AJ-517-M17 | M15 reference | Correction: the privacy@ address is in §7 "Your Rights", not §10 (§10 is Children). The ruling is unchanged. |
| AJ-517-M18 | Google sign-in from the Sign in tab can create an account without the box | v1 OK, on three conditions. (a) The T-234 "By continuing…" line stays visible beside the Google button, with links to both documents. (b) The stored record keeps `acceptedVia: 'google'`, so it never reads as a ticked box. (c) T-522 detects a new account created on this path and asks for consent with the M16 box at its next sign-in, recorded as its own acceptance. This is not signed past v1. |
| AJ-517-M19 | Privacy "Last updated" | OK: the date moves to the merge date and the version is not bumped. The §7 and §11 changes alter only the contact address, not processing, so no one is asked to accept again. |
| AJ-517-BC | Byte check, feature/t-517-landing-auth at dcbd8a92 | **Approved.** The consent line matches M16 exactly, the box is unticked by default, and a test pins both versions. The consent error line matches. The grievance line matches M11, falls back to "For complaints, write to contact@lawie.in." when no name is set, and takes the name from config only. Privacy §7 and §11 match M14 and M15 with no privacy@ left. "Last updated" is 21 October 2026 with no version bump (M19). The "By continuing…" line appears on the Sign in tab only (M18). Ink lines match M1, M2, M7, M8 and AJ-517-M12. The payment line matches AJ-509-M2, and "Redirecting you to the dashboard…" matches AJ-509-M3. Still open: the Grievance Officer name, which is a launch blocker. |
| AJ-517-M20 | Founder proposal to name an AI agent as Grievance Officer | **Not signed.** The Grievance Officer must be a natural person who answers for the company and can be held to account: the proprietor or founder, or a named employee. IT Rules 2021 r.3(2)(a) treats the officer as a person who receives complaints and disposes of them. DPDP Act 2023 s.8(10) needs an effective redressal mechanism, and an AI cannot be accountable for it. Publishing an AI persona's name as if it were an officer would also be a misleading statement in a statutory notice. **Allowed:** AI may help with triage and with the 24-hour acknowledgement, provided a human decides every complaint within 15 days. **Config:** `NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME` holds the person's real full name as they sign it, set in config only and never in repo files. Until a human is named, leave it unset, so the signed fallback `For complaints, write to contact@lawie.in.` shows. The M11 line is unchanged. The launch blocker stays open until a human name is configured. Exact DPDP Rules wording: verify. |
| AJ-517-M21 | Grievance Officer named (a natural person, the founder) and asked which email to print | **Keep `contact@lawie.in`.** The M11 line is unchanged, and so are §7, §11 and every other contact@ line. One address site-wide still holds (M15). A role mailbox is valid contact detail for the officer and survives a change of officer. **Condition:** the named officer personally receives and monitors every message to contact@lawie.in, for example by forwarding to their own mailbox, so the 24 h / 15 day timelines can be met. The personal address stays internal and is never printed. The name goes only in `NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME` (config), never in repo files. Once that is set in prod, the launch blocker is closed. |
| AJ-525-M1 | T-525 at f103f195, merge into develop_staging | OK to merge. Merges into develop_staging are not gated. M2 and M3 must be fixed before main. |
| AJ-525-M2 | Top-up modal vs signed §4.6 | **Must match §4.6 before main** (small follow-up). Title `Top up Ink`, not "Buy Ink for your bench". Button `Buy`, not "Pay with Razorpay". Loading shows a skeleton with no copy, not "Loading packs…". Add the note `Prices include GST. Top-up Ink does not expire while your account is open.` (M8). The "incl. GST" beside the total may stay. |
| AJ-525-M3 | "Popular" / "Best value" chips in the top-up modal | **Remove before main.** This breaks the signed site-copy-t252 M1, which already applies on develop_staging and is not new in T-525. The chips come from `badge` in the billing SKU config. "Popular" claims popularity we have no evidence for, which would be a misleading statement. "Lowest price per Ink of the 3 packs" may return only on the T-238 conditions. The paywall modal's "Best value" gets the same check in the same follow-up. |
| AJ-525-M4 | Unsigned strings listed by Priya | OK for v1 as they are: Settings h1, "Your State Bar Council", "e.g. D/123/2018", "Welcome to Lawie {tier}!", "Redirecting you to the dashboard…" (AJ-509-M3), "Close", "Remove coupon", "Coupon code (optional)", the GST picker and Invoices strings (already signed under T-436), and the section-finder labels ("Section finder", "Bookmarks", "Bare section text", "Open full reference", "Insert citation at cursor"). These are interface labels only. The bare section text the finder shows is still covered by the open P0-7 Bare Acts sign-off before prod. |
| AJ-535-BC | Byte check, fix/t-535-topup-signed-copy-danger-cue at 4103f843 | **The top-up modal is approved**: title `Top up Ink`, packs `{n} Ink, ₹{price}`, button `Buy`, the exact note `Prices include GST. Top-up Ink does not expire while your account is open.`, a skeleton with no copy, and `Could not load top-up plans.` + `Retry`. The chips are gone from the modal and the paywall. Approval of the whole ticket waits for M1 below. |
| AJ-535-M1 | Paywall top-up card `Mini · Mid · Max — never expires` | **Fix in T-535, before merge.** "Never expires" overstates the position, because top-up Ink lapses when the account is closed. Replace the line with `Top-up Ink does not expire while your account is open.` and drop the pack names. "One-time", "Top up Ink" and "Buy top-up" may stay. |
| AJ-535-M2 | Footer `You'll pay` / `₹X incl. GST` alongside the note | OK. It matches the note, and the total must be the amount Razorpay charges. |
| AJ-535-M3 | `badge` field still in the plans type and billing SKU config | Not blocking, because the web no longer renders it. Remove it from the billing config in a later ticket so it cannot come back. Until then, the T-535 test asserting no chip text must stay. |
| AJ-535-M4 | `UpgradeSuccessModal.tsx` lines 16 and 22: `Plan Ink resets each month; top-up Ink never expires` | **Change in T-535.** Signed: `Plan Ink resets each month; top-up Ink does not expire while your account is open`. Same reason as AJ-535-M1. |
| AJ-535-M5 | Terms §(payments), `Top-up Ink you buy separately never expires.` | **Change. This is legal content and needs a Terms version bump.** Signed: `Top-up Ink you buy separately does not expire while your account is open. It ends when your account is closed.` The live sentence makes an open-ended contractual promise that Ink outlives the account. The new text narrows that promise, so: (a) bump `CURRENT_TERMS_VERSION` and move "Last updated"; (b) if any top-up Ink has already been sold in prod, those purchases keep the old promise and the old sentence stays as the term for them, so ask Vikram to confirm the count; (c) the change applies to new purchases from the date the new version is published. Byte check by me before merge. |
| AJ-541-M1 | T-541 carve-out (AJ-535-M5 b) | **No carve-out needed.** Vikram confirmed on live Razorpay that no customer has bought a top-up. The only capture is the founder's own test purchase, which he can waive. The narrower Terms wording ships with the version bump, as signed in AJ-535-M5. |
| AJ-535-BC2 | Byte check, T-535 at 92457f38 | **T-535 approved.** The paywall card line is exact, the upgrade modal's two lines are exact (AJ-535-M4), and the amount-mismatch guard shows the signed `Something did not work. Try again.` (T-511 §5) without opening Checkout. The Terms are untouched; that change is T-541. |
| AJ-521-M1 | `Connection lost. Check your documents.` (dropped stream) | Signed. It makes no claim about Ink, which is correct. |
| AJ-521-M2 | `Finalise` / `finalised` status chip | Signed. These are the advocate's own status marks. Nothing may present "finalised" as reviewed, verified or court-ready by Lawie, and the editor's review-before-filing notice stays. |
| AJ-521-M3 | `Export` / `Export PDF / Word` | Signed. |
| AJ-521-M4 | `{n} Ink used` chip | Signed if {n} is the Ink actually debited for that draft (AJ-511-M1). If nothing was debited, show no chip, never `0 Ink used` on a failed draft. |
| AJ-521-M5 | `Your description` (BriefLoadError caption) | Signed. |
| AJ-521-M6 | Rows 455–459 and the line 358 placeholder (T-511 copy v1), newly used | Byte-exact reuse is OK. I check the exact text at READY. |
| AJ-521-M7 | Delete dialog privacy@ → contact@ | OK, per AJ-517-M15. |
| AJ-521-M8 | "Checks: N items" chip omitted | Agreed. It ships only once it has signed wording. |
| AJ-521-BC | Byte check, feature/t-521-intake-editor at da8769ee | **Approved.** The following match T-511 copy v1 byte for byte: `The draft did not finish. No Ink was used.` (shown only on a server error event that is not insufficient_ink, with the hold released, per AJ-511-M2/M5), `Could not read your description. Try again.`, `No documents yet` / `Your drafts will appear here.` / `Start a draft`, `Could not export. Try again.` and `Something did not work. Try again.`. A dropped stream makes no claim about Ink (AJ-521-M1). The placeholder is the signed sentence cut short with "…", which is OK. |
| AJ-521-M9 | The `{n} Ink used` chip shows the quoted cost, because the done event carries no debit | OK for v1, because the shown cost is the charged cost (AJ-511-M1). If the server can ever charge a different amount from the quote, the chip must show the real debit from that point. Priya's ticket for the server to send the debit should land before main. |
| AJ-531-M1 | Short phone CTA in the top bar | Signed: `Start free` / HI `मुफ़्त शुरू कीजिए`. It is true, because creating an account costs nothing and the Free plan exists. The Hindi uses the app's -इए form. The page it opens must keep showing the signed Free plan terms (5 Ink once your email is verified, one time). Never `Free forever`. |
| AJ-531-M2 | Phone menu button, accessible name | No legal issue. Suggested: `Menu` / HI `मेनू`, with the open or closed state carried by `aria-expanded` rather than the name. |
| AJ-531-M3 | Nav landmark labels | No legal issue. Suggested: marketing `Main` / HI `मुख्य`, dashboard `Dashboard` / HI `डैशबोर्ड`. |
