#!/bin/bash
# Lets the developer and tester inspect local/dev Mongo and Redis state
# (e.g. verifying seed data, debugging why a Mongo-backed test fails) without
# being able to write to any database through Bash.
#
# Only commands that mention mongosh or redis-cli are inspected; everything
# else passes straight through. Three gates, in order:
#   1. Reject chaining/substitution outright — a read-looking prefix can't be
#      trusted if something else could run after it.
#   2. Reject anything that looks like a non-local target.
#   3. Default-deny on the verb: the command must contain a recognized
#      read-only operation. Blocklisting write verbs instead would mean any
#      write op we didn't think to list (renameCollection, a raw runCommand,
#      a Lua EVAL) slips through; requiring an explicit read verb means an
#      unrecognized op is blocked by omission, not missed by omission.
CMD=$(jq -r '.tool_input.command // empty')
[ -z "$CMD" ] && exit 0

echo "$CMD" | grep -qE '\b(mongosh|redis-cli)\b' || exit 0

if echo "$CMD" | grep -qE '(;|&&|\|\||`|\$\(|\|)'; then
  echo "Blocked: db-readonly hook does not allow chained, piped or substituted commands ($CMD)" >&2
  exit 2
fi

if echo "$CMD" | grep -qiE '(mongodb\+srv://|amazonaws\.com|\.rds\.|prod|production|rediscloud|upstash|redis\.io)'; then
  echo "Blocked: db-readonly hook only allows local or dev database targets ($CMD)" >&2
  exit 2
fi

MONGO_READ='\b(find|findOne|aggregate|countDocuments|count|distinct|explain)[[:space:]]*\('
REDIS_READ='\b(get|mget|keys|scan|ttl|exists|type|strlen|llen|lrange|scard|smembers|hget|hgetall|zrange|zscore|dbsize|ping|info)\b'

if echo "$CMD" | grep -qE "$MONGO_READ|$REDIS_READ"; then
  exit 0
fi

echo "Blocked: no recognized read-only operation found; db-readonly hook default-denies ($CMD)" >&2
exit 2
