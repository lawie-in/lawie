# T-705 revisions: user-facing copy, draft v1 (Meera, 30 Oct 2026)

Rule (founder + Vikram, confirmed 30 Oct via Priya): one free revision per draft; each further revision costs the same Ink as the original draft; a failed revision is never charged. Live on prod only after Anushka passes it. NEEDS AJAY before any of it is built or shown. Not in the deck, ads or landing page until then.

Rules applied: no "free" except where it is the literal rule; the Ink cost is shown before the action (T-388 pattern, InkCostLine); no speed, outcome or accuracy claim; plain English, Hindi only after Ajay signs the English.

| Where | String | Note |
| --- | --- | --- |
| Cost line under the Revise button, first revision | Your first revision of this draft is included. | Same slot and style as "Uses N Ink" (InkCostLine) |
| Cost line, later revisions | Uses {n} Ink, the same as the original draft. | n from the real quote, never hardcoded |
| Button label | Revise draft | |
| Help text (i) next to the cost line | One revision per draft is included. Each one after that costs the same Ink as the draft. A revision that fails is not charged. | Exact rule in three sentences |
| Cost unknown (reuse T-388 block state) | We could not work out the Ink cost for this. Try again in a moment. | Already signed (T-388); link "Check the cost again" |
| Not enough Ink for a revision | You need {n} Ink to revise this draft. Top up or choose a plan to continue. | Mirrors the existing paywall copy |
| Revision failed | The revision did not finish. You were not charged. | Mirrors "The draft did not finish. You were not charged." |
| Pricing page FAQ, new question | Q: Can I revise a draft? A: Yes. Your first revision of each draft is included. Each further revision costs the same Ink as the original draft. A revision that fails is not charged. | Goes under "What is Ink?" |
| Dashboard low-Ink nudge (unchanged) | | No change: revisions use the same cost line |

For Ajay: everything above. The pricing FAQ answer is the public claim; the in-app strings follow it. For Rajesh: no new UI pattern; the InkCostLine slot carries the first two strings.
