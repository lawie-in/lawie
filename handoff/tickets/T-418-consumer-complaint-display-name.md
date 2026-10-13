# T-418: consumer complaint name and description don't say "District Commission"

| Field  | Value                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------- |
| Status | Todo. Waiting for Ajay's wording; Tanvi applies it (in T-410 if it arrives in time). Priya, 13 Oct 2026 |
| Owner  | Ajay (wording), Tanvi (apply)                                                                           |
| Mode   | Small fix (legal content)                                                                               |

## Why

Ajay (2a8b722): the consumer_complaint display_name and description say "District Commission". Since T-410, the complaint can go to the District, State or National Commission.

## Acceptance criteria

1. docs/templates/consumer_complaint.json display_name and description carry Ajay's new wording, byte for byte.
2. Any copy of those strings that is served (template list, Mongo sync) shows the new text after deploy.
