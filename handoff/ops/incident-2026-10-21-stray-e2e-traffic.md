# Incident note: stray browser-check traffic to api.lawie.in, 21 Oct 2026

Reported by Priya (Vishal's T-531 Playwright checks against a local `next build`), window ≈ 22:40–23:55 UTC. The build's `NEXT_PUBLIC_API_URL` pointed at `https://api.lawie.in`; the mocks caught only `localhost:4000`. Likely traffic: ~60+ anonymous consent POSTs (HeadlessChrome UA, random ids, "Decline") and dashboard GETs with a fake, unsigned JWT. No real user data, no PII, no Anthropic calls.

## Arjun's findings (from code on `develop_staging`; no server log access from here)

1. **Which environment:** `api.lawie.in` is the **develop test box** (founder, 17 Oct: one free-tier box, branch `develop`, no production exists). Not prod.
2. **Unsigned JWTs:** rejected. `apps/gateway/src/middleware/authenticate.ts` calls `jwt.verify(token, env.JWT_SECRET)`; a token without a valid HMAC signature throws and the handler returns **401 "Invalid token"**. The only way past verification is the dev bypass (`X-Dev-Bypass`), which is gated on `env.NODE_ENV === 'development'`; the box runs `production`, so it is inert. Nothing authenticated was served. (Founder can confirm from pm2 logs: `grep -c "Invalid token" ~/.pm2/logs/lawie-gateway-out.log` style, no PII involved.)
3. **Consent POSTs:** `POST /consent` is public by design (T-310: anonymous visitor's cookie decision), 1 KB body cap, no auth. The rows are synthetic consent records with random anonymous ids and a HeadlessChrome user-agent. They hold no PII, but the consent log is a legal record and should not carry test noise. **Recommendation: delete them** — founder, mongosh on the develop DB, by `createdAt` in the window **and** user-agent containing `HeadlessChrome`; count first, delete second, note the count here. Ajay informed (consent log hygiene).
4. **Exposure:** none beyond noise. No secrets were read (the box's env is not reachable from a browser), no Ink moved, no document created (every such route is behind `authenticate`).

## Hygiene follow-ups (ticket, Priya)

- **Test guard:** every local build and every Playwright/test script defaults `NEXT_PUBLIC_API_URL` to `http://localhost:4000`; the e2e config aborts any request whose host is not `localhost`/`127.0.0.1` (`page.route('**', …)` deny-by-default), and `next build` in CI/test fails if the URL is not local. Goes into T-523's AC and T-531's close-out.
- **Gateway:** pin `jwt.verify(..., { algorithms: ['HS256'] })` — defence in depth, no behaviour change.
- **Consent POST:** add a per-IP rate limit (it has none today) so a loop of anonymous posts cannot fill the log; keep 204 semantics.
- The founder's **"local builds never point at a hosted API"** rule is written into `.claude/docs/dev-lead-protocol.md` by Priya.
