# Live e2e against 1health dev

These tests run against the real 1health **dev** environment (`https://dev.1hdev.io`), with no mocks. They are not part of `pnpm test:e2e` or CI.

The mocked suites in `e2e/` cover every story and edge case. This suite checks what mocks can't:

- the real launch (backend-built LPL → `/auth` → `/api/token` → sealed session),
- the proxy allowlist against real responses,
- and the UI showing the dev user's actual data.

## How it signs in

For each test, the runner:

1. Signs the test user in through the OAuth2 flow (PKCE, `public-client`, adding a TOTP code when MFA is on).
2. Asks the backend for a Launch Payload (`GET /api/v2/external-application/173/launch-payload`). The backend creates a one-time code that lasts about 1 minute and encrypts it with the app's Security code.
3. Opens `<target>/auth?lpl=…`, the same way the portal does.

The one-time code is single use, which is why every test signs in again.

## Two ways to sign in

| Mode | When | How |
| --- | --- | --- |
| **Portal** (`LIVE_PORTAL_LOGIN=1`) | No plain patient test user (the usual case today) | A Chromium window opens the dev portal with `?openApp=173`. You sign in with your own account, **from the personal account**. When the portal launches the app, the setup catches the one-time `lpl` before it reaches the deployed app and launches the target app with it instead. The app session is saved in `test-results/.live-portal-session.json` (gitignored). Each test writes it back, and the next run reuses it without a window for up to 45 minutes. A launch from an organization is refused with `WRONG_TENANT`. Writes and logout run on that person's real account, and only with their flags. |
| **Token** (`LIVE_DEV_USERNAME`/`LIVE_DEV_PASSWORD`) | A dedicated plain patient user | The runner signs the user in without a browser, as described below. |

A pasted `lpl` can't be used: the one-time code expires about a minute after the portal issues it.

```bash
LIVE_PORTAL_LOGIN=1 pnpm exec playwright test -c playwright.live.config.ts                                          # read-only
LIVE_PORTAL_LOGIN=1 LIVE_ALLOW_WRITES=1 LIVE_ALLOW_LOGOUT=1 pnpm exec playwright test -c playwright.live.config.ts   # + writes, exit last
```

## Setup

1. **Test user.** Use a dedicated dev user:
   - a plain patient account, never a System Admin, multi-tenant admin or customer support user. Dev refuses those with `400 "Multi Tenant Admin and Customer support are not allowed to access Third-party applications"`, both here and from the portal;
   - ideally with MFA off.

   With MFA on, set `LIVE_DEV_TOTP_SECRET`. Three wrong codes lock the user for 5 minutes.

   The launch needs a token for the personal account (tenant 1), but the token carries the user's last used tenant. If that isn't 1, set `LIVE_DEV_SWITCH_TENANT=1`. Each test then calls `v2/user/switch-tenant/1?revokeToken=false`, as `1h-ng-api-test-py` does. Because the backend saves that switch as the user's last tenant, the test switches back to the original tenant when it ends.
2. **`.env.live.local`** at the repo root. `.env*` is gitignored, so it isn't committed.

   ```dotenv
   # Test user
   LIVE_DEV_USERNAME=
   LIVE_DEV_PASSWORD=
   # LIVE_DEV_TOTP_SECRET=          # base32, only if the user has MFA on
   # LIVE_DEV_REDIRECT_URI=https://dev.1hdev.io/authorized   # default; must be registered for public-client
   # LIVE_DEV_APP_ID=173            # default: "Personal Profile" on dev
   # LIVE_DEV_SWITCH_TENANT=1       # switch the token to tenant 1 (restored after each test)

   # Optional
   # LIVE_ALLOW_WRITES=1            # add + remove an address (reversible)
   # LIVE_ALLOW_LOGOUT=1            # "Return to 1health": revokes ALL sessions of the user
   # LIVE_BASE_URL=https://personal-profile-iota.vercel.app   # test a deployment instead of a local server
   # LIVE_PORT=3200

   # App server (local target only), the same names as .env.example.
   # The dev pair must be app 173's real values:
   #   the Security code, and an APP_ID exactly "173".
   # The demo/prod pairs may be any values, but never start them with "e2e-".
   # SESSION_SECRET needs at least 32 characters.
   ```

   For the app server's variables, copy the names from `.env.example` and fill in the dev pair.

## Run

```bash
pnpm exec playwright test -c playwright.live.config.ts                       # read-only
LIVE_ALLOW_WRITES=1 pnpm exec playwright test -c playwright.live.config.ts   # + reversible writes
pnpm exec playwright test -c playwright.live.config.ts --project=desktop e2e-live/live-profile.spec.ts
```

- By default, the config builds the app and starts it on `:3200`, with the mock and fixtures off.
- Don't run it while `pnpm test:e2e` is running: they share `.next`.
- With `LIVE_BASE_URL`, no local server starts.
- The report goes to `playwright-report/live`.

## What it covers

| Spec | What it checks |
| --- | --- |
| `live-profile.spec.ts` | Launch, header name, the tabs, the five Contacts Sections load, the Personal information first name, every dev email shown, Insurance loads, Medical placeholder |
| `live-account.spec.ts` | Settings show the dev username, the authenticator vendors, Provider Registration loads, My Organizations matches the dev list or shows the empty state |
| `live-writes.spec.ts` | (`LIVE_ALLOW_WRITES=1`, desktop) Each test snapshots its section, adds an item through the UI, confirms dev stored it, removes it through the UI, and checks the section is back as before. A teardown cleanup runs even when a test times out. Covered: a social link, and a non-primary address. The address test is skipped when the account has none, because the first address becomes Primary and dev never deletes a Primary. Insurance also needs `LIVE_ALLOW_SOFT_DELETE=1`, because its delete may only label the policy "Deleted". |
| `live-exit.spec.ts` | (`LIVE_ALLOW_LOGOUT=1`) Its own `exit` project, run after every other test. Return to 1health → dev portal, then `/` asks for a new launch. It revokes the user's dev sessions on every device and deletes the saved portal session. |

Every test fails if any `/api/*` call of the app answers 5xx.

## Can't be undone on dev

- **The first address of an account becomes its Primary, and dev never deletes or demotes a Primary.** The rule is in `PersonLocationFactory`: "first set another Location as the primary one". An account with no address can't go back to none.
- **An insurance delete can be soft.** The policy stays, labeled "Deleted".

## Kept out on purpose

These writes can't be undone cleanly, or they reach real people:

- MFA enable/disable,
- contact verification (real SMS and email),
- signature and picture uploads,
- provider registration,
- tenant switching.
