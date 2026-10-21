# Environment variable names

Founder rule (21 Oct 2026): the founder sets every value himself, so he must know each new variable **before** the deploy that needs it.

**The list is `.env.example` at the repo root.** There is no second list. Names, placeholders and a comment each; never a real value anywhere in the repo.

1. A ticket that adds, renames, or removes a variable updates `.env.example` in the same branch and lists the change (name, service, secret or public, required or optional) in the handoff packet and the READY message. No list in READY means no slot.
2. When the ticket merges, Priya tells the founder in the next update: "new variable to set before deploying: NAME (service)".
3. `NEXT_PUBLIC_*` variables are baked in at build time: setting one means rebuilding web, not restarting it.
4. The file was out of date on 21 Oct 2026; T-543 brings it level.
