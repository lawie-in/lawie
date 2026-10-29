# T-681b: Cache the intake `match` call's system/catalogue block

Status: backlog (small, not urgent). Raised 29 Oct 2026 by Arjun from Nikhil's prod token data (handoff/finance/drafting-model-opus-vs-sonnet.md section 2a).

## Problem
Every intake's `match` call sends about 7.2k uncached input tokens (the system prompt plus the catalogue). A Haiku cache read costs one tenth of an uncached read.

## Acceptance criteria
1. The system and catalogue block of the intake match call gets a cache_control breakpoint, and the prefix is byte-stable: catalogue order is deterministic, with no timestamps or ids before the breakpoint.
2. A test shows cache_read_input_tokens > 0 on the second identical-prefix call (a mocked usage check, or a cassette).
3. The prompt text does not change. If the text has to move for caching, Ajay byte-checks it (intake prompts are legal content).
One lead. Touches intake.service.ts only (plus tests).
