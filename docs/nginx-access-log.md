# Hiding verify-email and sign-in tokens from the nginx access log

Ticket T-377, acceptance criterion 2. For the founder to apply on the web server; Arjun (CTO) reviews first. The founder's step to apply this on the EC2 box is tracked on T-403.

## Why

The email verification link (`/verify-email?token=...`) and the Google sign-in callback (`/auth/callback?code=...`) carry a one-time token or code in the URL. nginx's default access log writes the full request line, including the query string, so that token would sit in a log file. The `Referrer-Policy` header on the web app (the code part of T-377) stops it leaking to other sites. This doc stops it landing in our own logs.

The requests are still logged. Only the query string is replaced with the text `?[stripped]`.

## Where the config lives

The repo has no nginx config for the web domain. The web nginx lives on the EC2 server, so this change cannot be committed as a config file; it has to be applied by hand there.

`docker/nginx/nginx.prod.conf` only serves the API domain on the unused docker path. The web paths above are not proxied there. It should get the same `map` and `log_format` for consistency, but that is not required for the fix and is not changed by this doc.

The snippet below works whichever file holds the site config. Everything in angle brackets is a placeholder you fill in from the server.

## What is not covered

- Application logs (pm2 and pino) are covered by T-223 AC8 and are not changed here.
- The `$http_referer` field is separate. An inbound Referer can carry a URL from another site, not ours, so it is out of scope.
- Never use `$request`, `$request_uri` or `$args` in the log format for these paths. Any of them brings the query back.

## The snippet

Put the `map` and `log_format` in the `http {}` context. These two directives are not allowed inside `server {}`.

```nginx
# Logs /verify-email and /auth/callback without their query string.
# Every other path is logged exactly as before.
map $request_uri $lawie_log_uri {
    default $request_uri;
    "~^(?<p>/(?:verify-email|auth/callback))/?\?.*$" "$p?[stripped]";
}

log_format lawie_noquery '$remote_addr - $remote_user [$time_local] '
                         '"$request_method $lawie_log_uri $server_protocol" '
                         '$status $body_bytes_sent '
                         '"$http_referer" "$http_user_agent"';
```

Then, in the web `server {}` block, point the existing access log at the new format. Keep the path you already have:

```nginx
access_log <existing-access-log-path> lawie_noquery;
```

Notes:

- The map only rewrites a request that has a query string. `/verify-email` with no query is already safe and is logged as is.
- A trailing slash before the `?` is allowed.
- Variables inside map values (`$p`) need nginx 1.11 or newer. On an older nginx, upgrade or ask Arjun. Do not work around it with `access_log off`, because we still want the requests logged.
- If the existing `access_log` line already names a different format, check that format's fields and copy any extra ones into `lawie_noquery`.

## Steps for the founder

Run these on the web server. Each `<...>` is a placeholder; where it comes from is in the step.

1. Check the nginx version. It must be 1.11 or newer.

   ```bash
   nginx -v
   ```

2. Find the active config and the current access log line.

   ```bash
   sudo nginx -T 2>/dev/null | grep -n -E 'configuration file|access_log|server_name'
   ```

   The `# configuration file <path>:` lines show which file each directive sits in. Note the file that holds the web site's `server {}` block (`<path-to-site-config>`), the file that holds `http {}` (usually the main `nginx.conf`), and the current `access_log` path (`<existing-access-log-path>`). `<web-domain>` is the domain the web app is served on.

3. Back up every file you are about to edit.

   ```bash
   sudo cp <path-to-site-config> <path-to-site-config>.bak-t377
   sudo cp <path-to-http-config> <path-to-http-config>.bak-t377
   ```

4. Edit the files.
   - Add the `map` and `log_format` from the snippet inside `http {}` (`<path-to-http-config>`, or a file it includes).
   - In the web `server {}` block, change the `access_log` line to end with `lawie_noquery`, keeping the same path.

5. Test the config. Do not reload if this fails.

   ```bash
   sudo nginx -t
   ```

6. Reload nginx.

   ```bash
   sudo systemctl reload nginx
   ```

7. Verify with a dummy value. Request both URLs once (browser or curl), then check the log.

   ```bash
   curl -s -o /dev/null "https://<web-domain>/verify-email?token=TEST-ONLY-123"
   curl -s -o /dev/null "https://<web-domain>/auth/callback?code=TEST-ONLY-123"
   curl -s -o /dev/null "https://<web-domain>/pricing?x=1"
   grep verify-email <existing-access-log-path> | tail -1
   sudo grep -c TEST-ONLY-123 <existing-access-log-path>
   ```

   Expected:
   - The `grep verify-email` line shows `/verify-email?[stripped]` and no token.
   - The count prints `0`.
   - A `/pricing?x=1` line still shows its query.

8. Roll back if anything is wrong.

   ```bash
   sudo cp <path-to-site-config>.bak-t377 <path-to-site-config>
   sudo cp <path-to-http-config>.bak-t377 <path-to-http-config>
   sudo nginx -t && sudo systemctl reload nginx
   ```

## Done when

- [ ] `nginx -v` is 1.11 or newer.
- [ ] `sudo nginx -t` passes and nginx is reloaded.
- [ ] The test request to `/verify-email` logs `/verify-email?[stripped]`.
- [ ] `grep -c TEST-ONLY-123` on the access log prints `0`.
- [ ] A normal path with a query still logs its query.
- [ ] The result is noted on T-403 and Arjun is told.
