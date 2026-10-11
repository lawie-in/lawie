# T-208 — Auth: a validation error returns 422 with its message, not 500

| Field          | Value                                                                    |
| -------------- | ------------------------------------------------------------------------ |
| Phase          | 0 — Prep                                                                 |
| Owner          | Lead (build). Anushka (verdict)                                          |
| Mode           | Build, full chain (auth)                                                 |
| Status         | Assigned to shashank, 11 Oct 2026. Not started |
| Assigned lead  | shashank |
| Size           | S (0.5 day)                                                              |
| Depends on     | None                                                                     |
| Gate           | Before v1 go-live (T-403)                                                |
| Branch         | fix/t-208-auth-validation-422                                            |
| Legal sign-off | Not needed                                                               |
| Created        | 2026-10-11                                                               |
| Source         | Finding from the T-196 build, 11 Oct 2026                                |

## Problem

`validateRegister` and `validateLogin` (`apps/auth/src/validators/auth.validator.ts`) throw a plain `Error` with `statusCode = 422`. `errorHandler` only trusts `AppError`, so it answers 500 "Internal Server Error", drops the message and sends the event to Sentry as unexpected.

## User

New advocate signing up who mistypes his email or uses a short password and gets "Internal Server Error" instead of the reason.

## Acceptance criteria

1. Register and login with an invalid body return 422 with the validation message(s) in `message`.
2. These are not sent to Sentry as unexpected errors.
3. Every other route that throws a validation error in auth behaves the same. The lead lists them in the report.
4. Tests: invalid email, short password, missing field on register; missing password on login → 422 and message.
5. Valid requests unchanged. CI green on auth.

## Out of scope

- Other services' error handlers
- Web wording of the message

## References

- T-196
