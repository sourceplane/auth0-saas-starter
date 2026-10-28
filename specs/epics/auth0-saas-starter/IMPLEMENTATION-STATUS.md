# auth0-saas-starter — implementation status

| Milestone | State | Landed |
|---|---|---|
| A00 — the spec | ✅ | the repository's first commit |
| A01 — the B2B SaaS on Workers | ✅ | A0-2 |
| A02 — a baseline | ✅ | A0-3, tagged `baseline-v1` |

## Departures from the upstream template

Everything not listed here is the template as it is at `12ad50e`.

| # | What | Why |
|---|---|---|
| 1 | The app lives in `apps/web` of a pnpm workspace; upstream's LICENSE is `apps/web/LICENSE.md`; npm → pnpm | The reference's shape |
| 2 | Next.js 16.0.10 (upstream's lock) → 16.3.8; every other dependency at upstream's locked version; `execa` and `ora` (the old bootstrap's) dropped | OpenNext 1.20.11's floor is 16.3.8 |
| 3 | `eslint.config.mjs`: upstream's `next/core-web-vitals`, in eslint-config-next 16's flat form | Next.js 16 removed `next lint` and the legacy config |
| 4 | `middleware.ts` kept on the edge runtime (Next 16 warns the convention is deprecated); routes that need Auth0 redirect home until a tenant is connected; `/api/health` excluded from its matcher | `proxy.ts` (Node.js) does not bundle on OpenNext 1.20.11 for this SDK (design §2) |
| 5 | The three clients built on first use (`lib/lazy.ts`; the two Auth0Client instances in `lib/auth0-clients.ts`, re-exported by `lib/auth0.ts`); `lib/roles.ts` reads the role ids when used | On Workers the secrets reach `process.env` with a request |
| 6 | `allowInsecureRequests` only when the tenant's domain is `http://` | A local stand-in tenant (the e2e's); a real tenant is always https |
| 7 | The connection switch (`lib/auth0-connection.ts`, decided by `next.config.ts`), the "connect Auth0" notice on the home page, the dashboard and onboarding layouts sending an unconnected render home | A product deploys before its owner has a tenant |
| 8 | `NEXT_PUBLIC_AUTH0_DOMAIN` inlined from `AUTH0_DOMAIN` by the build; the server reads `AUTH0_DOMAIN`; `AUTH0_MANAGEMENT_API_DOMAIN` defaults to it | One secret for the domain, the SSO forms still show it |
| 9 | `app/site.ts` (`SITE_NAME` = SaaStart, `SOURCE_URL`, `SITE_URL`, `SITE_SLUG`) for the title, header, copy, MFA enrollment title and the domain-verification record's prefix; `metadataBase` and `appBaseUrl` from `NEXT_PUBLIC_SITE_URL`; a source link on the home page | One rename seam; each product its own origin |
| 10 | Heap analytics (`<Script id="heap">`, the author's app id) removed | It reported every product's visitors to the template author |
| 11 | `next.config.ts`: `output: 'standalone'`, the trace root at the workspace root, `images.unoptimized`; `open-next.config.ts` and `wrangler.jsonc` added | OpenNext's build |
| 12 | `app/api/health/route.ts` added | The deploy's smoke and the record's probe |
| 13 | `scripts/bootstrap.mjs` → `tooling/auth0/bootstrap.mjs` (`pnpm auth0:bootstrap`): zero-dependency, idempotent, writing Orun secrets per environment (`--local`: `.env.local`), each step upstream's; actions via `auth0 api` instead of `auth0 actions …`; the e-mail body in `templates/verify-email.html`; `initiate_login_uri` the environment's origin (upstream: `https://example.com/auth/login`); the management application gets `client_credentials` explicitly | design §3 |
| 14 | `prettier.config.mjs`, `.nvmrc`, `vercel.json`, README-ADVANCED not carried; the README's content is the product README's | Nothing here runs Prettier; the product's README is its own |

## Departures from the reference (clerk-auth-starter / portfolio-starter-kit)

| # | What | Why |
|---|---|---|
| 1 | The tenant's configuration is eleven optional Orun secrets; the build withholds all but the domain (`env -u`, `AUTH0_CONFIGURED` in their place) and `worker-secrets.mjs` pushes them all | design §2 |
| 2 | `tooling/auth0` placed by `01-product`; the site's `package.json` has `auth0:bootstrap` | The bootstrap is the site's, run by its owner |
| 3 | `tests/web/src/fakes` (a stand-in tenant, Auth0 CLI and orun CLI) ships with the site's tests | The site's own bootstrap suite runs against it |
| 4 | The e2e's connected tier runs the placed site's bootstrap against the stand-in, twice, builds with exactly what it stored, and signs a visitor in and out on workerd | The whole connect path, offline |

## Verified

- `pnpm typecheck`, `lint`, `test` (tests/web 20: identity, the switch and
  health route, the lazy clients and roles, the secret push, the bootstrap
  against the stand-in — created, a second run with no write, a dry run with
  no write, a second environment on the same tenant, a stale secret
  replaced and the session secret kept) and `build` green; the Worker is
  1.67 MiB gzipped (Workers Free).
- `wrangler dev` over the build: unconnected, `/` the connect notice and
  `/dashboard`, `/onboarding`, `/auth/login` home; connected to the
  stand-in, a whole sign-in (PKCE, the code exchanged, a session) and the
  signed-in home page.
- Every contract tier, the leak gate, placement and the e2e pass locally on
  orun v2.89.0.
