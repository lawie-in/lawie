# T-125 end-to-end plan: the one flow, describe to draft

Written by Vishal, 6 Oct 2026. **Not run yet.** It needs the local stack with the real database, Redis and model, and a signed-in browser. It replaces `T-103-T-104-e2e-plan.md`. The two old check scripts are in `_retired/`.

## Before you start

1. `develop` with PR #45 in it. All services up. Web on `localhost:3000`.
2. `yarn workspace @lawie/drafting seed:all` has been run. Without the courts list no court document can be drafted.
3. `feature.describe_first` is on for the test account, and `ai.intake_model` and `ai.drafting_model` are set.
4. The test account has Ink.

Run every step at desktop width and at 360 px. Write the result of each step under it: pass, or what happened.

## A. A document with a rule pack

1. New document opens on the describe screen. No list of documents, no form.
2. Type the founder's sentence of 5 Oct: "My brother was arrested by Sadar Thana Police on 25th August 2026 from lajpat market..." and continue.
   - Expected: questions for Regular Bail, or "Which document do you need?" with Regular Bail first. Never Anticipatory Bail on its own.
3. Answer two questions, skip the rest.
4. On the brief:
   - The document is Regular Bail Application, with "Change".
   - "Date of arrest" holds 25 August 2026 with "Please check". "Date of FIR" is "Not given". The arrest date is not under the FIR date.
   - Court is empty. Confirm is off and says "Choose the court to continue."
   - The applicant's name is filled only if the description gave it.
5. Choose state, court type and court. Each waits for the one before. Confirm switches on.
6. Clear the applicant's name. Confirm is off with the line about the party. Put it back.
7. Type a police station. Go to "Edit my description", change nothing, continue.
   - Expected: straight back to the brief, with the police station, the court and the answers still there. No waiting, no new reading.
8. "Change" → search "anticipatory" → choose it → "Change" → choose Regular Bail again.
   - Expected: nothing typed is lost. Anything with no place shows under "Other things you gave".
9. Confirm. Expected: the generating screen, then "Your draft is ready".
   - Write down: label or no label, the line under it, each finding, the number of blanks.
10. Open in editor. If the draft had the label, it shows at the top of the editor.
11. Export PDF and DOCX. A labelled draft has the starting-draft footer in both. Open the DOCX in Word to check.
12. In the database: one `Generation` row, `status: completed`, real tokens, `intakeId` set. The document has `rulePackId`, an encrypted `brief`, and `formInputs` with only `template_id` and `source`.

## B. An anticipatory request

13. "My client fears arrest in FIR 88/2026 at Kotwali, Patna and wants protection from arrest." Expected: Anticipatory Bail, or a choice with it first. Never Regular Bail on its own.

## C. The three date texts (T-105)

14. "FIR dated 10/03/2026. He was arrested on 15/03/2026." Expected: each date under its own meaning.
15. "The incident was on 5 March 2026." on a bail request. Expected: not under FIR date or arrest date.
16. "On 12 August 2026 a notice came." Expected: "You wrote 12 August 2026. What is it the date of?" Choosing a meaning fills that date. "Not needed" removes the question.

## D. A document with no rule pack

17. "I need a consent letter for Sunita Devi to let her shop be used as a clinic, addressed to Patna Municipal Corporation." Expected: up to 5 questions, round 1 of 2.
18. Answer one, continue. Expected: the brief with "No Lawie rules for this one", four parts, no court part.
19. Type "the appeal is pending" into the facts. Expected: the court part appears and Confirm is off.
20. Remove it. Confirm. Expected: a draft that always carries the label, with no line under it.
21. In the database: `docType: guided`, a `demand.guided_draft` event with no user text.

## E. Things that must not happen

22. "Draft a special leave petition for the Supreme Court." Expected: the no-match screen, no draft.
23. With too little Ink: the paywall, nothing charged, the brief still there.
24. Stop the drafting service during a draft. Expected: "The draft was not written", not charged, "Try again" keeps the same run.
25. Browser storage (DevTools → Application): nothing of the description or the brief in local or session storage at any step.
26. After the draft, "Start another document": the description box is empty.

## F. Browse

27. "Browse document types" → pick Regular Bail Application. Expected: the describe screen with that name as the heading. Continue goes to questions or the brief for that document, with no "Which document?".
28. No screen in the flow says "template".

## G. The switch off

29. Turn `feature.describe_first` off for the account. Expected: the old list and long form, as before.

## Not covered by this plan

- The gate over the test set (T-113).
- Length and estimate (T-203). Images and PDFs (T-301, T-304).
