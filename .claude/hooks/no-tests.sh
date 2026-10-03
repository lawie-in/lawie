#!/bin/bash
# Blocks the developer agent from editing test files or golden snapshots.
# A developer weakening a test to make it pass defeats the point of having a tester.
FILE=$(jq -r '.tool_input.file_path // empty')
[ -z "$FILE" ] && exit 0

case "$FILE" in
  */__tests__/*|*.test.ts|*.test.tsx|*__snapshots__*)
    echo "Blocked: developer may not edit test files or snapshots ($FILE). If a test encodes behaviour this ticket changes on purpose, report it and leave it for the tester." >&2
    exit 2
    ;;
esac
exit 0
