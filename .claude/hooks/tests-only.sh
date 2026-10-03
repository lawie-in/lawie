#!/bin/bash
# Restricts the tester agent to editing test files only. The tester must never
# change source to make a test pass — a failing test caused by source is a finding.
FILE=$(jq -r '.tool_input.file_path // empty')
[ -z "$FILE" ] && exit 0

case "$FILE" in
  */__tests__/*|*.test.ts|*.test.tsx)
    exit 0
    ;;
esac
echo "Blocked: tester may edit test files only ($FILE)" >&2
exit 2
