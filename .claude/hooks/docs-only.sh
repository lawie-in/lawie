#!/bin/bash
# Restricts the doc-writer agent to editing Markdown files only.
FILE=$(jq -r '.tool_input.file_path // empty')
[ -z "$FILE" ] && exit 0

case "$FILE" in
  *.md|*.mdx)
    exit 0
    ;;
esac
echo "Blocked: doc-writer may edit Markdown files only ($FILE)" >&2
exit 2
