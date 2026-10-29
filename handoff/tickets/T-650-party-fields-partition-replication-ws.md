# T-650 — Party names still blank in the partition, replication and written-statement packs

Status: assigned to tanvi, 29 Oct 2026. Split from T-644, 28 Oct 2026. This is legal content: pack JSON changes need Ajay's sign-off.

## Problem
After T-644's plaintiff/defendant aliases, three packs still print "_____" for one party:
- plaint_partition prints {defendants} (plural), but its form has only defendants_details and no defendant_name.
- replication has plaintiff_name but no defendant_name field.
- written_statement has defendant_name but no plaintiff_name field.

## Acceptance criteria
1. Each pack collects both party names, or maps them from fields it already has. Ajay rules on which per pack.
2. No "_____" in a cause title when both parties were given. A missing party is asked for, with the same ask lines as T-644.
3. Tests for each pack use fictional parties. Golden snapshots are hand-edited only, with the diff sent to Priya and Ajay.
