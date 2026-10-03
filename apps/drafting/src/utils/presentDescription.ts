// 72 of 92 document-rules JSON files store description as
// "Document-rules config for <template id> — <actual description>".
// That's config-authoring metadata, not user-facing copy, and the JSON
// files are legal content (need Ajay's sign-off to edit), so it's
// stripped here instead. Descriptions without the prefix pass through.
// The id segment isn't always a single token — some files add a parenthetical
// (e.g. "joint_development_agreement (JDA)") — so match up to the first
// " — " non-greedily rather than assuming \S+. The captured remainder may
// itself contain further em-dashes; that's fine, (.*) is greedy to the end.
const DESCRIPTION_CONFIG_PREFIX = /^Document-rules config for .+? — (.*)$/;

export function presentDescription(description: string): string {
  const match = description.match(DESCRIPTION_CONFIG_PREFIX);
  if (!match) {
    return description;
  }
  const rest = match[1];
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}
