# CMO Opinion: Pre-Generation Verification Layer

**My call: Build it now. Always-on for free + paid. Soft-block, never hard-block.**

This is the single highest-leverage trust signal we can ship before paid conversion. An advocate's reputation lives or dies on filed paper. A tool that catches a wrong section before the draft prints is not friction — it is a senior junior whispering "sir, ye dhyan se dekhiye." That is the brand.

---

## 1. Net effect on activation

Lifts conversion. Dominates friction. Here is why: our ICP is not a SaaS power user — they are a 31-year-old advocate in Muzaffarpur who got burned once by a typo in a vakalatnama. The 16-22s wait is already psychologically a "machine is doing senior's work" moment. A 1-3s pre-flight check that says "I noticed something" reframes Lawie from *autocomplete* to *associate*. Friction kills activation when it is procedural (OTPs, captchas). Friction *builds* activation when it demonstrates competence. This is the latter.

The activation window is draft 5-10. Verification compresses it — one "good catch" and trust forms at draft 2.

## 2. First-time-user paradox + sample copy

Frame as observation, not accusation. Never say "error" or "mismatch." Position as *the advocate noticing*, with us as the polite junior pointing.

**Exact copy (FIR mismatch case):**

> **Ek baat dhyan mein aayi — confirm kar lein?**
>
> Aapne FIR number **091/2021** likha hai, lekin date **06.01.2026** di hai. Aam taur par FIR ka year aur date ka year same hota hai.
>
> - [ ] Yes, FIR number 091/2021 sahi hai (purani FIR hai)
> - [ ] Number galat type ho gaya — sudharna hai
> - [ ] Date galat hai — sudharni hai
>
> *Aap chahein toh skip karke aage badh sakte hain.* [Skip & Generate]

Hindi-English mix, no red icons, no "Warning." A junior asking respectfully. Skip is visible — we are not gatekeeping.

## 3. When NOT to verify

Three skip rules:

- **Trusted-hand rule:** paid user + 30+ generated drafts + sub-5% historical edit-after-generate rate → skip silently. They know what they are doing.
- **Low-stakes template rule:** rent agreements, NDAs, simple notices — skip. Verification is for criminal/civil filings where a wrong section is career damage.
- **Repeat-input rule:** advocate has used this exact party/FIR combo before in their history → it is not unusual *for them*.

## 4. Free-tier vs paid

**Always-on. Do not gate it.**

Gating verification to paid is a self-own. Free trial is where trust is earned. If the verifier catches a BNS 103(1) error on draft 3 of a free trial, that advocate converts at draft 6. If we hide it behind paywall, they generate a wrong draft, lose face, churn before paying. Verification is the *reason* they pay — it cannot be the *reward* for paying.

## 5. The skip pattern

Soft-block always. Show the questions, but always render a visible "Generate anyway" button. Hard-blocking an advocate is paternalistic and they will hate us for it — they know their case better than we do (sometimes the FIR really is from 2021). Log the skip-rate per flag-type so Ajay can tune the taxonomy. If skip-rate on a flag exceeds 60%, that flag is noise, kill it.

## 6. Impact on rate-output gate (SCRUM-59)

Net positive on rating velocity. Cleaner inputs → fewer regenerations → less rating fatigue. The advocate who would have rated 3/5 and re-drafted now rates 4/5 once. We earn the credit faster, they hit draft 10 faster, conversion conversation arrives sooner. The verifier is the rate-gate's best friend.

## 7. One A/B test post-launch

Cohort A: verification on. Cohort B: verification off.
**Primary metric:** trial-to-paid conversion at day 14.
**Guardrail:** time-to-first-draft. If B converts equally and A is slower, kill it.

Ready for next task.
