# T-387: pre-filing check F4, enrolment number (signed)

Signed: Ajay (CLO), 13 Oct 2026 IST. Build d7c18fd (Mahak). Approved.

F4 checks the enrolment number the vakalatnama will print, using the renderer's own functions (`clientFormData`, `resolveAdvocate`, `resolveEnrollmentNumber`):

1. A typed number wins.
2. Otherwise the profile number, but only when the printed advocate name is also the profile's.
3. Otherwise blank, and then F4 blocks.

F4 and the document can never disagree.
