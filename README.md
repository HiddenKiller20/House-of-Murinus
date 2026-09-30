# The House of Murinus
An independent VRChat Warhammer 40,000 community moderation hub. Runs on Railway or any host supporting Node.js 24 and a persistent disk. No ChatGPT account, OpenAI API, Cloudflare Worker, or D1 service is needed.

## Deploy on Railway
1. Create a Railway service from `HiddenKiller20/House-of-Murinus`, branch `main`. The included Dockerfile is detected automatically.
2. Attach a **persistent volume mounted at `/data`** before accepting reports. The database and staff sessions are stored in `/data/murinus.sqlite`. A directory on the service's temporary filesystem is not durable storage.
3. In the service's Variables, set `STAFF_PASSWORD` to a unique password of **at least 16 characters**. Do not put it in GitHub. The app refuses to start without it.
4. Generate a public domain in Railway's networking settings. Set `APP_ORIGIN` to that exact HTTPS origin, for example `https://your-service.up.railway.app`, without a trailing slash. Railway's `RAILWAY_PUBLIC_DOMAIN` is used as a fallback when APP_ORIGIN is omitted.
5. Redeploy. Health check: `/health`. Railway supplies `PORT`; the server binds to `0.0.0.0`.
6. Open **Staff workspace** and sign in with your staff password. Visitors can view approved records and submit evidence without an account.

Use one replica with the attached volume. Keep volume backups. Changing STAFF_PASSWORD and restarting invalidates all existing sessions. Sessions otherwise expire after eight hours.

## Local development
Requires Node.js 24 or later. No npm packages to install.

```sh
export STAFF_PASSWORD='choose-a-long-local-password'
npm start
```

Open http://localhost:3000. Data defaults to `./data`; use DATA_DIR to change it. For a local origin override, set APP_ORIGIN to the exact local URL. Run `npm test` for the private report lifecycle, authorization, session, and restart persistence checks.

## Included
- Offense categories and review principles
- Searchable active blacklists and information cases
- Private evidence-link intake with case references
- Password-based staff login, HttpOnly sessions, and server-side authorization
- Staff approval, dismissal, and revocation
- SQLite persistence on a mounted volume

Only staff-published summaries and group scope appear in the public registry. Reporter contact, raw evidence links, and private decision notes remain staff-only. Evidence uses HTTPS links; direct file uploads, Discord synchronization, and automated staff notifications are not configured. The original spider image bytes are encoded in public/spider.base64 and served as /spider.png.

Existing records from another hosting provider are not automatically copied. This repository contains source code and branding only, with no passwords or private reports. The older ChatGPT-hosted deployment is separate and has not been deleted or modified by this export.

Login and report limits use the network peer address. Behind a shared proxy they may apply across visitors; this intentionally does not trust client-supplied forwarding headers. Staff access uses one shared password; distribute it only to approved reviewers.
