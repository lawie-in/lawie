# Manual erase of one user: runbook (Arjun, 12 Oct 2026)

> **Stale (Priya, 14 Oct 2026):** T-115c changed the erase flow (auth-orchestrated, new erase-user exit codes, reviewer feedback anonymised). Until this file is rewritten, follow the "Closing and erasing an account" section of the root README.md.


This meets T-235's go-live condition: Arjun confirms a manual erase can be run today.
- **Who runs it:** the founder. Only he holds the production Atlas, Redis and Razorpay credentials.
- **It can't be undone:** we have no backups.
- **Use a placeholder, never the real value, when writing about an erase anywhere:** `U = ObjectId("<userId>")`, `E = "<account email>"`.

## Preconditions

1. Dry run on the develop database first, with a seeded user, counting rows before and after.
2. Ajay decides the items marked "Ajay" below. Until he does: tombstone the user record and keep billing rows.
3. Cancel any active Razorpay subscription in the dashboard first. There is no cancel call in the code.
4. Confirm that auth, drafting and billing use the same database (the three `MONGO_URI` values).

## Step 0: read-only

| # | Action | Why |
|---|---|---|
| 0a | `users.findOne({_id:U})` → note `E`, `plan` and `role` | Stop if this is the founder or the golden-set fixture user |
| 0b | `D = documents.distinct('_id',{userId:U})` | Needed for review tokens and feedback |
| 0c | `I` = union of `intakeId` from generations, factledgers and llmauxcalls `{userId:U}` | Needed for the Redis `intake:*` keys |
| 0d | `subscriptions.find({userId:U})` → if active, cancel in Razorpay | Otherwise the plan renews and charges a deleted user |

## Step 1: lock the account, then Redis (all safe)

| # | Target | Action |
|---|---|---|
| 1a | `users` | `updateOne({_id:U},{$set:{isActive:false}})` |
| 1b | Redis `session:<userId>:*` | SCAN, then DEL. Logs the user out at once |
| 1c | Redis `session:refresh:<userId>:*` | SCAN, then DEL |
| 1d | Redis `intake:burst:<userId>`, `intake:day:<userId>:*` | DEL |
| 1e | Redis `intake:owner:<id>`, `intake:followups:<id>` for each id in `I` | DEL |
| 1f | Redis `intake:cache:*` | Can't be filtered: it's encrypted with a 30-min TTL. Wait 30 min |
| 1g | Redis `rl:<userId>` | DEL |
| 1h | BullMQ `{lawie}:email-high:*`, `{lawie}:email-low:*` | Never DEL by pattern: that breaks the queue. Let them expire, or remove matching jobs one by one through the BullMQ API |

## Step 2: Mongo children before the user

All of these are indexed on `userId`.

| # | Collection | Filter | Note |
|---|---|---|---|
| 2a | `reviewfeedbacks` | `{documentId:{$in:D}}` | Ajay: deleting a reviewer's feedback is fine? |
| 2b | `reviewtokens` | `{$or:[{documentId:{$in:D}},{assignedEmail:E}]}` | |
| 2c | `factdiffs` | `{userId:U}` | Includes fixture rows |
| 2d | `factledgers` | `{userId:U}` | |
| 2e | `generations` | `{userId:U}` | |
| 2f | `llmauxcalls` | `{userId:U}` | |
| 2g | `documents` | `{userId:U}` | Hard delete, including `isDeleted` rows |
| 2h | `usagelogs` | `{userId:U}` | |
| 2i | `events` | `{userId:U}` | |
| 2j | `templateusages` | `{userId:U}` | |
| 2k | `sectionbookmarks`, `sectionrecents` | `{userId:U}` | After 1b |
| 2l | `bonuscredits` | `{userId:U}` | |
| 2m | `sessions` | `{userId:U}` | |
| 2n | `auditlogs` | `{userId:U}` | Ajay: keep `payment` and `account_delete` events as the record of the erase? |
| 2o | `couponusages` | `{userId:U}` | Ajay: deleting resets the per-user coupon limit |

## Step 3: billing and tax records (Ajay decides)

| Collection | Proposal |
|---|---|
| `subscriptions` | Keep. They hold ids only |
| `inkledger` | Keep payment and top-up rows. Delete usage rows |
| `creditledgers` | Keep payment rows. On usage rows, delete or blank `reference`: it can hold a draft title |

Ajay: is it enough to keep these rows under a pseudonym (GST s.35/36, about 6 years)? Does a GST invoice need the name or email kept?

## Step 4: the user record (last)

Recommended: a tombstone.
- `$unset`: email, name, phone, googleId, password, barCouncilId, enrollmentNumber, state, practiceAreas, passwordResetToken, referredVia.
- `$set`: `{isActive:false, erasedAt:now}`.

A hard delete leaves billing rows pointing at a missing user and can break the admin pages. Email is unique, so unset it; don't blank it.

## Step 5: third parties

| Party | Can we erase? |
|---|---|
| Razorpay | No: an RBI-regulated entity must keep the records. Cancel only |
| Sentry | By hand: find the user's issues by email or id. §7 doesn't promise this |
| Anthropic | Not ours. Their retention applies |
| Helicone | No (before 9 Oct). Already disclosed |
| pm2 / email-worker logs | Grep and redact by hand until T-247 |
| Amazon SES | No |

## Still missing for a repeatable erase

This belongs to T-115 and doesn't block go-live:
- `scripts/erase-user.ts`, with a dry run and counts;
- a purge of BullMQ jobs by recipient;
- log rotation (T-247);
- Sentry header scrubbing (T-229).

## Ajay's decisions (6941007): the erase condition is met

| Item | Decision |
|---|---|
| Step 3, billing | Ledger rows kept under a pseudonym: yes. Any tax invoice Lawie issued is kept as issued for 72 months (CGST s.36). The email is never needed. Name, address and GSTIN are kept only if the invoice carries them. Vikram to confirm whether we issue invoices at all |
| Step 4, user record | Tombstone. No hash or copy of the email kept anywhere |
| 2a, reviewer feedback | Delete |
| 2n, audit events | Keep `payment` and `account_delete` events, stripped to userId, type and time |
| 2o, coupon usages | Delete |
| Sentry | Erased by hand. §7 now says so. §7 and §9 disclose tax-record retention; the lead applies that text with the rest of T-235 |

- Compliance register (Ajay): batch 1 #16 bail_juvenile_jj_12 handles a child's data (DPDP s.9). Lawie acts as the advocate's processor. The policy and the register should note it.

## Note (Priya, 12 Oct 2026)

Ajay condition 5 on T-242: deleting an account must remove the whole User document, including `signupSource` (UTM tags and time). No delete path exists today.
