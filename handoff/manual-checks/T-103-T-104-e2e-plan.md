# End-to-end check: describe-first (T-103, T-104) against the real API

For the browser test agent. Run after `feature/t-101-intake-backend` and `feature/t-103-describe-first-web` are merged into `develop` and that build is running.

## Setup (a person does this, not the agent)

1. Redis is up. Intake refuses to run without it.
2. In `/admin/ai-config` (AppSetting collection) set:
   - `ai.intake_model` = `claude-haiku-4-5-20251001`
   - `ai.rates.claude-haiku-4-5-20251001` = the Haiku rates, as T-003 seeded the others
   - `feature.describe_first` = the test user's id (not `on`, so real users do not see it)
3. Settings are cached for 60 seconds. Wait a minute after changing them.
4. Give the agent: the web URL, the test user's login, and a second login that is NOT in `feature.describe_first`.
5. Each describe uses a real Haiku call. The test user is limited to 10 per 10 minutes. Step 7 generates one real draft and spends the test user's credits.

## Steps

Run each at desktop width (1280) and at 360 px. Take a screenshot at every **Check**.

1. **Flag off.** Log in as the second user and open New document.
   **Check:** the template gallery shows as before. No "What do you need to draft?" box.

2. **Describe screen.** Log in as the test user and open New document.
   **Check:** heading "What do you need to draft?", one text box, "Continue", a "Browse templates" link, and "Find your FIR on the Bihar police portal". The FIR link opens in a new tab. Nothing on screen names a mode, route or confidence.

3. **Keyboard only.** On the describe screen, Tab through every control and type a description without the mouse.
   **Check:** focus is visible on each control and the order makes sense. Continue works with Enter or Space.

4. **Matched, with follow-up questions.** Enter:

   > My client Ram Kumar, son of Shri Hari Kumar, aged 32, was arrested on 15/03/2026 in FIR No. 124/2026 at Kotwali police station, Patna, under section 103 BNS. He has been in judicial custody since then. We need to apply for regular bail.

   Press Continue.
   **Check:** "Reading your description…" while it waits. Then follow-up questions appear inline on the same page, with "Fill in the details myself" and "Continue". Answer them and press Continue.

5. **Review screen (T-104).**
   **Check:**
   - The title is the document type (regular bail), with a "Not this document?" link under it.
   - Ram Kumar, Hari Kumar, 32, 15/03/2026 and 124/2026 are filled in the right fields.
   - Court, district and police station are NOT filled from the description. The user picks them.
   - Missing required fields are highlighted. "Generate document" stays disabled while any are empty.
   - Every field can be edited.

6. **Not this document?** Click it.
   **Check:** it goes back to the choices or the gallery. Pick regular bail again: the values you typed come back.

7. **Generate.** Fill the remaining required fields. "Generate document" becomes enabled. Click it.
   **Check:** "Generating…", then the draft opens at `/dashboard/documents/<id>`.

8. **Which document?** New document again. Enter:

   > Need a notice for my client about money he is owed by a company.

   **Check:** "Which document do you need?" with up to 3 choices and "None of these". Pick one and the review screen opens with that title. Go back, choose "None of these", and the no-match screen appears.
   The model decides the outcome, so this text may match a template directly. If it does, record it and try: "Need a petition for my client in a property matter."

9. **No match.** Enter:

   > Please write a birthday poem for my brother who lives in Delhi.

   **Check:** "We could not find a ready document for this", with Browse templates. Nothing says "no match" or "guided".

10. **Edit the description.** From the follow-up step, click Edit.
    **Check:** back on the describe screen with the text still there.

11. **Errors.** Enter fewer than 20 characters and press Continue.
    **Check:** a friendly message, no crash. Then send 11 describes within 10 minutes.
    **Check:** the 11th shows "You have used today's quota for describing. Browse templates still works." and Browse templates still works.

## Not visible in the browser (Vishal or a person checks)

- The `Generation` row for step 7 has `intakeId` and `runType` set.
- `LlmAuxCall` has rows `intake_match` and `intake_fill` for each describe, with numbers only: no description text.

## Report back

For each step: pass or fail, the screenshots at both widths, and for each fail what was on screen and the exact text entered.
