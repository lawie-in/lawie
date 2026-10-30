# T-700b: The written statement's Memo of Parties drops the plaintiff's name

Status: backlog, P1 (Anushka MAJOR, v1.3.0 prod check FAIL, 30 Oct 2026). Raised by Priya. drafting is claimed by Arjun this month, so Arjun decides who fixes it.

On prod v1.3.0, the Memo of Parties for a written statement (document 6ae42303811b4e546540b8e7) prints "Plaintiff  [To be confirmed: name of the Plaintiff]" although the brief holds the plaintiff's name. On a WS the advocate's client is the defendant, so the plaintiff is the opposite party; the Memo's civil-role mapping likely reads the wrong brief field.

## Acceptance criteria
1. A WS whose brief names the plaintiff prints that name in the Memo's Plaintiff row; the placeholder shows only when the brief has no name.
2. The same check for the defendant row, and for replication and plaint.
3. A test on Anushka's case. Legal content (annexures.service.ts): Ajay byte-checks the final SHA.

Also from the same run: payments, invoice and raise-a-concern were NOT tested on prod (no payment on the test account, no inbox access). That stays open until someone makes a real test payment.
