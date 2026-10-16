# T-501: Verify the Family Courts of every Bihar and Jharkhand district

| Field  | Value |
| ------ | ----- |
| Status | To do. V1.1 (Ajay, 16 Oct 2026, ref 9ad6a8f1). Priya |
| Owner  | Ajay verifies from the sources; a lead updates the court list |
| Mode   | Full chain (legal content path) |

## Source

T-482 (maintenance S.144 BNSS routing). Ajay: only the Patna and Ranchi Family Courts are verified. For every other district the list offers the Court of the Judicial Magistrate First Class, {district}; Ajay will not list a Family Court he has not confirmed from its s.3 notification (Family Courts Act, 1984) or the official district court site.

## What

Ajay verifies, district by district, which Bihar and Jharkhand districts have a notified Family Court and the seat name. Then the court list (indian-courts.json and the seed) adds each verified Family Court and removes the JMFC offer for that district where the Family Court has jurisdiction.

## Acceptance criteria

- A verified table (district, Family Court seat, source: notification number or official site) signed by Ajay.
- The picker offers the Family Court for verified districts and the JMFC elsewhere; tests per district class; reseed note in the Release line.
