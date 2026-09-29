# Appsmith Client
This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).
<br><br> 
For details on setting up your development machine, please refer to the [Setup Guide](../../contributions/ClientSetup.md)

## Run the frontend locally (including Windows)

Use Node.js 24.14.1 or newer within version 24. From `app/client`, install dependencies with the repository's bundled Yarn:

```powershell
node .yarn/releases/yarn-3.5.1.cjs install
```

Create `.env.local` in this directory to connect to an existing Appsmith backend. For the staging backend documented in the setup guide:

```dotenv
HOST=127.0.0.1
APPSMITH_BACKEND_URL=https://release.app.appsmith.com
```

Read the `version` field from the selected backend's `/info` endpoint and add it as `REACT_APP_APPSMITH_VERSION_ID` in `.env.local`. For example, PowerShell can read the staging version with:

```powershell
(Invoke-RestMethod https://release.app.appsmith.com/info).version
```

This supplies the development frontend's version header, which must match the backend. Refresh this value and restart the frontend if the backend is upgraded. Production continues using its server-injected version.

Start the frontend and open **http://localhost:3000**:

```powershell
node .yarn/releases/yarn-3.5.1.cjs start
```

If port 3000 is already in use, add `PORT=3001` to `.env.local` and open **http://localhost:3001** instead. Hot reload uses the same port.

When using staging, create an email/password account on [staging's signup page](https://release.app.appsmith.com/user/signup), complete any required verification there, then sign in through localhost with the same credentials. Staging requires reCAPTCHA for signup, and this local setup does not include its site key. Local signup needs `REACT_APP_GOOGLE_RECAPTCHA_SITE_KEY` and a hostname approved for that key by the backend owner.

Staging's Google sign-in uses Appsmith's hosted central OAuth callback and does not establish a localhost session through this proxy. A Google-only account has no Appsmith password by default. Use an email/password account for this development setup; do not enter your Google password in the Appsmith password form.

`APPSMITH_BACKEND_URL` must contain only the backend's HTTP(S) origin, without credentials, a path, or query parameters. The development server proxies `/api`, `/oauth2`, `/login`, and `/rts` to that origin, verifies upstream TLS certificates, and rewrites cookie domains and backend redirects for localhost. Keep the browser on `localhost` when using HTTP so secure session cookies can work. Sign-in and application data belong to the selected backend; external OAuth providers may require an approved callback URL.

No Docker, nginx, or hosts-file change is needed for this setup. Restart the development server after changing `.env.local`. Omit `APPSMITH_BACKEND_URL` to use the existing nginx setup described in the full guide. `.env.local` is gitignored.

## Use a local backend on Windows

Start Docker Desktop with its Linux engine running. From the repository root, run:

```powershell
.\scripts\start-local-backend.ps1
```

The script starts the official `appsmith/appsmith-ce:release` image using [docker-compose.local.yml](../../deploy/docker/docker-compose.local.yml). It publishes the backend only on `127.0.0.1:8080`, waits for its API to become ready, and updates only `APPSMITH_BACKEND_URL` and `REACT_APP_APPSMITH_VERSION_ID` in `app/client/.env.local`. Existing frontend settings, including `PORT`, are preserved. The first download and initialization can take several minutes; use `-TimeoutSeconds 1200` if initialization needs longer.

Restart the frontend after the script succeeds:

```powershell
cd app/client
node .yarn/releases/yarn-3.5.1.cjs start
```

Open the frontend on its configured port (`http://localhost:3000`, or `http://localhost:3001` when `PORT=3001`). A fresh backend opens initial setup, where the first account becomes the instance administrator. This account and its applications belong to your local backend. The container's bundled frontend is also available at **http://localhost:8080**.

Docker stores application data and generated configuration in the persistent `asmith-local_appsmith-data` volume. Rerunning the script reuses that data. The container restarts with Docker unless it was explicitly stopped. The script does not create an account or restart the frontend. If readiness times out, inspect the `asmith-local` project in Docker Desktop and rerun the script after resolving the startup error.

## Marketplace integration frontend

The separate integration routes are `/marketplace` for the asset catalog, `/marketplace/items/:id` for item details, and `/workspace` for dashboard drafts and editing. These routes use the `operator_display` session and marketplace APIs, not Appsmith's `/v1` workspace APIs. A live marketplace session is needed to see real items.

The administration frontend starts at `/admin`. Its sidebar opens Groups, Users, Marketplace Tags, Access Setup, Sites, Test Cells, and Universal Variables. `/marketplace/items/:id/manage` opens item content, media, and tag management. The admin area shares Appsmith Admin Settings' extracted frame and navigation, and Group General/Members uses the same ADS tabs as workspace settings. Screen actions use typed Java clients. A live `operator_display` session is needed to populate them. Publication, item/site/test-cell group assignments, group deletion, and universal-variable writes are visibly disabled until their backend contracts are ready. See [the administration screen map](../../ADMIN_SCREENS_BACKEND_MAP.md) for route permissions and backend issues.

From `app/client`, the controlled browser check runs against a local frontend preview with Java-shaped responses intercepted in the browser:

```powershell
$env:MARKETPLACE_URL = 'http://127.0.0.1:3006'
node scripts/verify-marketplace.cjs
```

Use the actual preview origin in `MARKETPLACE_URL`. The check covers group filters, item detail access errors, search, pagination, and mobile layout; it does not verify a live Java deployment. The Java paginator currently joins different item filters with `OR`, so the UI applies one group, type, or tag filter at a time. The backend has no registered action to set an item public or published; the frontend labels item creation as an upload.

To check the administration screens with controlled Java-shaped responses, set `ADMIN_URL` to the local frontend origin and run:

```powershell
$env:ADMIN_URL = 'http://127.0.0.1:3003'
node scripts/verify-admin.cjs
```

This visits each admin route, exercises group and tag creation, checks a failed user creation, and confirms backend-pending actions stay disabled. It is a frontend browser check, not a live Java deployment check.
