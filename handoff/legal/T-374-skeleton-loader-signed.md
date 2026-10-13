# T-374: skeleton loader build sign-off (signed)

Signed: Ajay (CLO), 13 Oct 2026 IST. Build: f8d50b7 on feature/t-374-skeleton-loader (Tanvi).

| Pack | Signed file version | SHA-256 of `_skeletons/<pack>.json` (prefix) | Byte-equal to signed block |
|---|---|---|---|
| bail_regular | v2 | 604acbe65cd5df1b | yes |
| bail_anticipatory | v3 | 50b7dd20bcaccdbc | yes |
| bail_before_magistrate | v4 | 0404960987deb50c | yes |
| default_bail | v1 | 1f0384f6c8f2feff | yes |

Approved. Under `document-rules/`, only the four `_skeletons/` files are added; no pack or `_averments` file changed. Any later change to a skeleton needs a re-signed `skeleton-<pack>-signed.md` first, and the loader's hash test enforces that.
