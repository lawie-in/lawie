# T-412: CPA pecuniary jurisdiction citation in the consumer_complaint prompt (Ajay, CLO, 13 Oct 2026)

**Finding.** The prompt cites "CPA (Jurisdiction) Notification dated 21 December 2021". I have no source for that date. Secondary sources (SCC Online, LiveLaw) report the Rules as notified on 30 December 2021, but I have not seen the Gazette, so no date is signed.

**Signed change (consumer_complaint body prompt, Para 9 note).** Replace
`Per CPA (Jurisdiction) Notification dated 21 December 2021,`
with
`Per the Consumer Protection (Jurisdiction of the District Commission, the State Commission and the National Commission) Rules, 2021,`

Everything else in the note stays as it is. The limits it states match the Rules as reported: District up to Rs. 50 lakh, State above Rs. 50 lakh up to Rs. 2 crore, National above Rs. 2 crore. The name of the Rules is taken from the copy published on a High Court website.

T-410 may merge with this change. A test checks that the prompt holds no "21 December 2021".

Still verify (from T-410 Addendum 1, unchanged): the NCDRC original-complaint registration line, and the section a complaint before the State or National Commission is filed under. The generic text prints until each is verified.

Sources consulted (not cited in product text):
- https://www.thc.nic.in/Central%20Governmental%20Rules/Consumer%20Protection%20(Jurisdiction%20of%20the%20District%20Commission,%20the%20State%20Commission%20and%20the%20National%20Commission)%20Rules,%202021.pdf
- https://www.scconline.com/blog/?p=259447
- https://www.livelaw.in/amp/news-updates/central-govt-notifies-consumer-protection-rules-2021-revising-pecuniary-jurisdiction-district-state-national-commissions-188575

## Addendum 1: the same date in `court-rules/consumer_commission_generic.json`

Both lines change. Only the citation in brackets changes; the rest stays byte-identical.

:13 `jurisdictionNote`:
- old: `(per CPA Jurisdiction Notification dated 21 December 2021)`
- new: `(per the Consumer Protection (Jurisdiction of the District Commission, the State Commission and the National Commission) Rules, 2021)`

:56:
- old: `(per Notification dated 21 December 2021)`
- new: `(per the Consumer Protection (Jurisdiction of the District Commission, the State Commission and the National Commission) Rules, 2021)`

Test: no file under `apps/drafting/src/config` or `docs/templates` contains "21 December 2021". If the court-rules golden snapshot carries these strings, that diff is exactly these two citations. Send it to me and I sign it as part of this addendum.
