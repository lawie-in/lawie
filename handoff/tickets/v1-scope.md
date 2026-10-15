# V1 scope: what ships at launch, what comes after

Priya, 14 Oct 2026, at the founder's request. **Arjun confirmed the technical calls and Ajay the legal ones (14 Oct, 23:40 UTC); the founder has the last word.** Rule used (Arjun, 14 Oct): a ticket is V1 only if it is a user-visible bug, wrong money/Ink/data, a security or data-protection must-fix, a legal must-fix (Ajay), a release gate, or a go-live prerequisite. Everything else is later.

Open tickets today: **101** = **43 V1** + **29 V1.1** + **29 later**. Done and closed tickets are not listed.

- **V1**: must be done before launch (T-403).
- **V1.1**: small improvements and rare edge cases; ship in the weeks after launch.
- **Later**: new features, epics and pricing changes (v2 and beyond).

## V1: before launch

Must be done and merged (and Anushka passed) before T-403.

| Ticket | Title                                                                  | Status                 | Owner    | Why                                                                                                                                 |
| ------ | ---------------------------------------------------------------------- | ---------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| T-113  | Intake test set and the gate before switching on                       | doing                  | -        | release gate or go-live prerequisite                                                                                                |
| T-115  | Permanent delete, and encrypt saved case details                       | doing                  | -        | privacy, money, legal or wrong-data must-fix (Arjun's rule)                                                                         |
| T-116  | Complete the legal-content list                                        | todo                   | -        | release gate or go-live prerequisite                                                                                                |
| T-171  | Unmatched High Court falls back to Patna HC rules                      | closed (already built) | -        | a draft or export is wrong, or Ajay's legal condition                                                                               |
| T-172  | Annexure text with '$&' is mangled by String.replace                   | todo                   | -        | Arjun: wrong text in a filed document is a user-visible bug (one-line fix)                                                          |
| T-187  | Retention and deletion rule for the Fact Ledger and intake_extract row | todo                   | arjun    | a draft or export is wrong, or Ajay's legal condition                                                                               |
| T-188  | Unresolved ledger items past the question cap are never silently guess | todo                   | arjun    | a draft or export is wrong, or Ajay's legal condition                                                                               |
| T-193  | Bail packs warn when the applicant is under 18                         | todo                   | -        | Ajay: an under-18 applicant gets a draft for the wrong forum (JJ Board)                                                             |
| T-198  | Rent agreement keeps both fathers' names                               | review                 | ajay     | a draft or export is wrong, or Ajay's legal condition                                                                               |
| T-220  | Emails actually reach users                                            | review                 | founder  | email, sign-in or data-protection basics                                                                                            |
| T-221  | Forgot password works end to end                                       | todo                   | shashank | email, sign-in or data-protection basics                                                                                            |
| T-222  | A new user gets a welcome email                                        | review                 | madhuri  | email, sign-in or data-protection basics                                                                                            |
| T-227  | The price a user sees is the price charged                             | review                 | anushka  | the price and Ink a user sees must match what is charged                                                                            |
| T-229  | No credentials or personal data reach Sentry from any service          | todo                   | shashank | email, sign-in or data-protection basics                                                                                            |
| T-230  | The sign-in token carries no email or name                             | review                 | arjun    | email, sign-in or data-protection basics                                                                                            |
| T-232  | Logging and Sentry follow-ups from T-210                               | review                 | arjun    | email, sign-in or data-protection basics                                                                                            |
| T-233  | Exported files: empty DOCX and wrong-side PDF margin                   | review                 | mahak    | a draft or export is wrong, or Ajay's legal condition                                                                               |
| T-235  | Privacy policy covers Google sign-in data and where data is stored     | review                 | ajay     | release gate or go-live prerequisite                                                                                                |
| T-236  | Re-check mandatory clauses after citations are removed                 | todo                   | -        | a draft or export is wrong, or Ajay's legal condition                                                                               |
| T-238  | Pricing page says every document costs 1 Ink                           | review                 | mahak    | the price and Ink a user sees must match what is charged                                                                            |
| T-244  | Sign-in tokens must not travel in the OAuth redirect URL               | todo                   | arjun    | email, sign-in or data-protection basics                                                                                            |
| T-245  | Criminal packs cite IPC/CrPC for offences before 1 July 2024           | doing                  | vishal   | T-245a in progress. T-245b is V1 for every criminal pack in the launch catalogue (Ajay); packs not in the launch catalogue are V1.1 |
| T-247  | Server log rotation and retention; email-worker stops logging recipien | todo                   | arjun    | email, sign-in or data-protection basics                                                                                            |
| T-252  | Public site copy says only what the product does                       | todo                   | meera    | release gate or go-live prerequisite                                                                                                |
| T-254  | Sample PDFs: pull them now, regenerate with fictional values, Ajay sig | todo                   | -        | release gate or go-live prerequisite                                                                                                |
| T-329  | One court_levels list; price check in every generate handler           | todo                   | kunal    | the price and Ink a user sees must match what is charged                                                                            |
| T-356  | Feature switches on by default for new users                           | doing                  | shashank | release gate or go-live prerequisite                                                                                                |
| T-358  | Delete email accounts never verified after 30 days                     | doing                  | tanvi    | privacy, money, legal or wrong-data must-fix (Arjun's rule)                                                                         |
| T-364  | Ink cost and plan shown in the app match the pricing page              | todo                   | -        | the price and Ink a user sees must match what is charged                                                                            |
| T-376  | Real-model golden set: required check with Anushka's six drafts        | review                 | vishal   | release gate or go-live prerequisite                                                                                                |
| T-377  | Verify link not leaked via referrer or logs                            | todo                   | -        | email, sign-in or data-protection basics                                                                                            |
| T-378  | Husky's prepare script doesn't break Docker builds                     | todo                   | -        | release gate or go-live prerequisite                                                                                                |
| T-392  | Enrolment placeholder blocks the profile number                        | todo                   | -        | a draft or export is wrong, or Ajay's legal condition                                                                               |
| T-398  | Pricing Pro and Free cards                                             | todo                   | -        | the price and Ink a user sees must match what is charged                                                                            |
| T-401  | One consistent flow, end to end                                        | blocked                | -        | the release steps themselves                                                                                                        |
| T-402  | Test the flow with 3 to 5 advocates                                    | blocked                | -        | the release steps themselves                                                                                                        |
| T-403  | Release v1 to production from main                                     | blocked                | -        | the release steps themselves                                                                                                        |
| T-424  | Affidavit Memo can print petitioner as applicant                       | review                 | mahak    | privacy, money, legal or wrong-data must-fix (Arjun's rule)                                                                         |
| T-431  | Affidavit deponent side on drafting path                               | todo                   | mahak    | privacy, money, legal or wrong-data must-fix (Arjun's rule)                                                                         |
| T-436  | GST tax invoice for every payment                                      | doing                  | kunal    | privacy, money, legal or wrong-data must-fix (Arjun's rule)                                                                         |
| T-438  | Razorpay status values and timing-safe internal secret                 | todo                   | -        | privacy, money, legal or wrong-data must-fix (Arjun's rule)                                                                         |
| T-440  | Not known date prints To be confirmed                                  | review                 | shashank | privacy, money, legal or wrong-data must-fix (Arjun's rule)                                                                         |
| T-442  | Deploys fail loudly when a service is unhealthy; one deploy path       | todo                   | mahak    | go-live prerequisite (Arjun)                                                                                                        |
| T-443  | Retire the legacy POST /documents/generate route (410)                 | todo                   | mahak    | wrong-law draft reachable by API (Arjun)                                                                                            |
| T-441  | Remove judgment names from drafting prompts                            | todo                   | vishal   | privacy, money, legal or wrong-data must-fix (Arjun's rule)                                                                         |

## V1.1: soon after launch

Not blocking. Weekly review with Arjun picks what to pull forward.

| Ticket | Title                                                                      | Status | Owner  | Why                                                           |
| ------ | -------------------------------------------------------------------------- | ------ | ------ | ------------------------------------------------------------- |
| T-446  | Upgrade page shows a 'fix your payment' message on 409 subscription_exists | todo   | -      | small improvement, after T-444 (Arjun)                        |
| T-449  | Civil and family packs: no judgment names in model-visible text            | todo   | -      | Ajay: same rule, V1.1 group                                   |
| T-450  | Deeds and agreements packs: no judgment names in model-visible text        | todo   | -      | Ajay: same rule, V1.1 group                                   |
| T-128  | Fill the gaps in the rule packs                                            | hold   | -      | old rule-pack sweep (quality polish)                          |
| T-129  | Prayer and verification text for packs that have none                      | hold   | -      | old rule-pack sweep (quality polish)                          |
| T-134  | Ask the user which document, do not guess                                  | hold   | -      | parked should-fix items                                       |
| T-139  | Do not ask again for what I already gave                                   | hold   | -      | parked should-fix items                                       |
| T-153  | Custody and jail field for Magistrate bail                                 | todo   | -      | improvement or rare edge case; safe to ship after launch      |
| T-154  | Rule-pack sweep for named judgments                                        | hold   | -      | old rule-pack sweep (quality polish)                          |
| T-155  | 15 High Courts mapped to district_court_generic                            | hold   | -      | old rule-pack sweep (quality polish)                          |
| T-156  | One designation per state rule per document                                | hold   | -      | old rule-pack sweep (quality polish)                          |
| T-157  | '/' state lines in Bihar, Jharkhand, sessions_generic and other courts     | hold   | -      | old rule-pack sweep (quality polish)                          |
| T-158  | Party labels for revisions, complaints, appeals, either-party applicat     | hold   | -      | old rule-pack sweep (quality polish)                          |
| T-160  | Addressing clause repeats the city                                         | hold   | -      | old rule-pack sweep (quality polish)                          |
| T-191  | Code computes the default-bail threshold                                   | todo   | -      | improvement or rare edge case; safe to ship after launch      |
| T-195  | Allowed texts for banned entries with no allowed partner                   | hold   | -      | old rule-pack sweep (quality polish)                          |
| T-207  | none_contain unlock test for averments                                     | hold   | -      | old rule-pack sweep (quality polish)                          |
| T-231  | The verifier recognises sections cited together                            | review | ajay   | improvement or rare edge case; safe to ship after launch      |
| T-243  | Waitlist form before go-live                                               | todo   | rajesh | Arjun: V1.1 unless launch is waitlist-gated (founder decides) |
| T-246  | Self-host the Google Font in LogoSplash                                    | hold   | -      | parked should-fix items                                       |
| T-261  | Clause repair after check 3, and an abbreviation-aware sentence splitt     | todo   | ajay   | improvement or rare edge case; safe to ship after launch      |
| T-262  | Rename the review_petition option id from s413 to s403, with a read-ti     | hold   | -      | parked should-fix items                                       |
| T-272  | Doc follow-ups after T-235 (from Mahak's doc-writer)                       | hold   | -      | parked should-fix items                                       |
| T-326  | Converter: new-provision rows read "Section NEW-1 IPC"                     | todo   | rajesh | improvement or rare edge case; safe to ship after launch      |
| T-330  | Key the drafting behaviour gates on template id or catalogue category      | hold   | -      | parked should-fix items                                       |
| T-352  | Date reader counts other date kinds before assigning a quote               | todo   | vishal | improvement or rare edge case; safe to ship after launch      |
| T-391  | New draft page reads ?type=                                                | todo   | -      | improvement or rare edge case; safe to ship after launch      |
| T-414  | Own-words check marks dates by position                                    | todo   | vishal | improvement or rare edge case; safe to ship after launch      |
| T-419  | PDF and DOCX buttons meet 44 px                                            | hold   | -      | parked should-fix items                                       |
| T-420  | Blanks check before the annexures pack                                     | todo   | -      | improvement or rare edge case; safe to ship after launch      |
| T-421  | Ask the client's side when annexures are refused                           | todo   | -      | improvement or rare edge case; safe to ship after launch      |
| T-434  | Billing hygiene: Ink units, dead credit code, schema                       | todo   | -      | improvement or rare edge case; safe to ship after launch      |

## Later: enhancement versions

Parked on purpose. None of these is a launch task.

| Ticket | Title                                                                  | Status | Owner    | Why                                                                       |
| ------ | ---------------------------------------------------------------------- | ------ | -------- | ------------------------------------------------------------------------- |
| T-004  | Check the drops formula against real cost                              | hold   | -        | drops pricing (pricing v2)                                                |
| T-108  | Cost and price for guided drafts and page reading                      | hold   | -        | drops pricing (pricing v2)                                                |
| T-111  | Review by agent, as a paid option                                      | hold   | -        | drops pricing (pricing v2)                                                |
| T-201  | Ledger moves from Ink units to drops                                   | hold   | -        | drops pricing (pricing v2)                                                |
| T-202  | Charge by paragraphs: 50 drops + 2 per paragraph                       | hold   | -        | drops pricing (pricing v2)                                                |
| T-203  | Web: length picker, estimate and drops balance                         | hold   | -        | drops pricing (pricing v2)                                                |
| T-204  | Pricing copy and terms for drops                                       | hold   | -        | drops pricing (pricing v2)                                                |
| T-205  | Revise a draft: paid, same run                                         | hold   | -        | drops pricing (pricing v2)                                                |
| T-206  | Default and minimum paragraphs for each document type                  | hold   | -        | drops pricing (pricing v2)                                                |
| T-224  | Payment and balance emails                                             | hold   | -        | drops pricing (pricing v2)                                                |
| T-239  | Template catalogue: 92 to about 500 (epic)                             | hold   | ajay     | template catalogue growth                                                 |
| T-253  | Lawie Assistant: a chat helper for advocates (epic)                    | hold   | -        | new features and epics (assistant, judgments, bail checker, civil plaint) |
| T-257  | Template batch 1: criminal (16 templates)                              | hold   | -        | template catalogue growth                                                 |
| T-258  | Template batch 1: civil (#18–#33, 16 templates)                        | hold   | -        | template catalogue growth                                                 |
| T-259  | Template batch 1: family, succession, consumer (#34–#44, 11 templates) | hold   | -        | template catalogue growth                                                 |
| T-260  | Template batch 1: notices, deeds, RTI, contempt (#45–#53, 9 templates) | hold   | -        | template catalogue growth                                                 |
| T-265  | Template batch 2: criminal, first 11 templates                         | hold   | -        | template catalogue growth                                                 |
| T-283  | Remove the describe_first and fact_ledger switches after v1            | hold   | -        | after-v1 cleanup and extensions                                           |
| T-286  | Judgments P0: summary of a judgment the advocate gives us              | hold   | ajay     | new features and epics (assistant, judgments, bail checker, civil plaint) |
| T-361  | Bail checker reads BNS and gives the right punishment                  | hold   | shashank | new features and epics (assistant, judgments, bail checker, civil plaint) |
| T-368  | Civil plaint for recovery of money: right court and pleadings          | hold   | -        | new features and epics (assistant, judgments, bail checker, civil plaint) |
| T-386  | Hindi for the D1 packs                                                 | hold   | -        | after-v1 cleanup and extensions                                           |
| T-389  | Skeleton loader: scalar equals and all_of                              | hold   | -        | after-v1 cleanup and extensions                                           |
| T-435  | Post-v1 legacy billing cleanup                                         | hold   | -        | after-v1 cleanup and extensions                                           |
| T-437b | Cache the pack prompt behind a switch                                  | hold   | -        | after-v1 cleanup and extensions                                           |

## Open for the founder

- T-243 (waitlist form): Arjun's view is V1.1 unless launch is waitlist-gated. Placed V1.1 here; tell me if launch is gated by a waitlist.
- T-252 (public site copy only says what the product does): V1 whatever the marketing plan, because claims on the public site are Ajay's domain (Arjun).
- T-245b: V1 for every criminal pack in the launch catalogue; packs outside it are V1.1 (Ajay). Which packs are in the launch catalogue is still to be listed.
  | T-447 | Criminal packs: no judgment names in model-visible text | todo | - | Ajay: wrong-law/citation risk in drafts (T-441 group) |
  | T-448 | Writ packs: no judgment names in model-visible text | todo | - | Ajay: same rule, writs group |
  | T-451 | Judgment names in form labels and printed clause text | todo | - | Ajay: reaches the user or the filed document, always V1 |
  | T-302 | Consent line and retention rule for uploads | delivered | ajay | founder 15 Oct: uploads are V1 (policy wording to be read by a practising lawyer) |
  | T-303 | Spike: can we read Hindi and handwritten FIRs? | todo | vishal | founder 15 Oct: uploads are V1 |
  | T-301 | Attach images as matter context | todo | vishal | founder 15 Oct: uploads are V1 (needs re-scope onto the brief flow) |
  | T-304 | Attach PDFs as matter context | todo | vishal | founder 15 Oct: uploads are V1, after T-301 |
