# T-691b: Move the golden-set DB off production onto a fixtures cluster

Status: waiting on the founder (cluster creation). Raised 30 Oct 2026 by Arjun. This settles the Atlas question from T-659.

## Why
GOLDEN_SET_MONGODB_URI points at PRODUCTION. The nightly golden set writes runType=fixture rows to prod. We will not open the prod cluster to 0.0.0.0/0 for a test job.

## Steps
1. Founder: create a free-tier fixtures cluster (e.g. "lawie-fixtures", M0) with a readWrite user on that DB only. That cluster (not prod) may allow 0.0.0.0/0.
2. Founder: point the GOLDEN_SET_MONGODB_URI secret at the new cluster. He sets the secret value himself; never in chat or docs.
3. Lead: seed what the harness needs (courts, packs) on the fixtures cluster. Confirm a nightly run is green and writes nothing to prod.
4. Until this is done, prod fixture rows are excluded from every count. That is tolerated for days, not weeks.

T-691 (A/B) does not wait for this: it runs against an ephemeral Mongo (mongodb-memory-server or a docker mongo) and never touches prod.
