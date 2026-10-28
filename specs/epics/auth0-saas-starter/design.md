# auth0-saas-starter — design

## 1. The template

Auth0's B2B SaaS starter (`main` at `12ad50e`): Next.js 16 (App Router),
`@auth0/nextjs-auth0` v4 for sign-in and sessions, the `auth0` Node SDK v4
for the Management API, Radix UI (shadcn/ui), Tailwind v3. Two Auth0
applications: the **Dashboard** application signs people in to an
organization (`organization_usage: require`); the **Management**
application signs a new visitor up (its own Auth0Client, `/onboarding/*`)
and calls the Management API (client credentials) to create the
organization, add members and roles, manage SSO connections, SCIM, MFA and
security policies. Three post-login Actions (add the default role, put the
roles in the tokens, enforce the organization's security policies) run in
the tenant. There is no database: the tenant IS the data store, so this port
adds none.

Upstream ships `scripts/bootstrap.mjs`, a one-shot CLI that drives the Auth0
CLI (signed in to the tenant) to create the applications, the grant, a
database connection, the roles, the Actions and their bindings, the Universal
Login theme, the verification e-mail and the MFA factors, then writes
`.env.local` for `http://localhost:3000`. It creates everything anew on every
run.

## 2. How each Vercel piece maps to Cloudflare

| Vercel | Here | Why |
|---|---|---|
| Next.js on Vercel | `@opennextjs/cloudflare`: one Worker + Static Assets, the static-assets incremental cache | The Orun starters' proven path; nothing revalidates |
| `middleware.ts` on the Edge runtime | The same file, OpenNext's edge middleware | Next 16's Node.js `proxy.ts` does not bundle: OpenNext 1.20.11's Node-middleware bundler cannot resolve `critters`, which `@auth0/nextjs-auth0/server` drags in (its `with-page-auth-required` helper imports `next/navigation`, which pulls Next's pages runtime). The edge path builds; Next 16 warns the convention is deprecated (risk A0-D) |
| Env vars in the Vercel project | Orun secrets per environment, read by the build as optional refs; the tenant's domain inlined, everything else withheld from the build and pushed to the Worker as Worker secrets | No credential in a bundle, a build cache or a log |
| Clients built at module load | Built on first use (`lib/lazy.ts`), every call site unchanged | On Workers a Worker's secrets reach `process.env` with a request; an unconnected site must construct nothing |
| `pnpm auth0:bootstrap` writing `.env.local` | The same command, idempotent, writing the environment's Orun secrets (§3) | A deployed environment has no `.env.local`; a re-run must not duplicate a tenant |
| Heap analytics in the root layout (the author's app id) | Removed | It would report every product's visitors to the template author |
| `metadataBase: https://saastart.app`, `APP_BASE_URL` by hand | `NEXT_PUBLIC_SITE_URL` per environment; Auth0's `appBaseUrl` follows it | Each environment's own origin |

## 3. The tenant bootstrap

The brief's "tenant-bootstrap CLI → setup hook". Two shapes were possible:

- **A deploy-time hook** that runs the bootstrap whenever the environment
  holds tenant-admin credentials. Rejected: setting a tenant up creates
  applications, grants and Actions, so the hook would need a Management API
  credential with `create:clients`, `create:actions`, `update:client_grants`
  and more stored as an Orun secret and exposed to every deploy — a far
  larger credential than anything the site itself needs — and every deploy
  would write to the tenant.
- **A command the owner runs once per environment** — chosen. `pnpm
  auth0:bootstrap --env <env>` runs on the owner's machine with the Auth0
  CLI's own login (`auth0 login`, the owner's admin rights, never stored
  anywhere of ours), talks to the tenant only through `auth0 api` with each
  body on stdin, and writes the site's configuration as the environment's
  Orun secrets through `orun secrets set` with each value on stdin. A
  redeploy picks the secrets up. `--local` keeps upstream's `.env.local`
  flow for `next dev`.

It is idempotent end to end:
- **Tenant objects:** each is found by name (`<SITE_NAME> Management`,
  `<SITE_NAME> Dashboard`, `<site-slug>-shared-database`, the roles, the
  Actions), created only when missing and updated only when it differs.
  The environment's origin is *added* to the applications' callback,
  logout and web-origin lists, so one tenant can serve stage and prod.
- **Actions:** an Action's secrets cannot be read back, so one is
  redeployed when its code, dependencies or secret names differ, or with
  `--refresh-actions` (after rotating the management application's secret,
  which "Add Default Role" holds).
- **Orun secrets:** each is written with an HMAC fingerprint of its value
  in its display name (`orun secrets set --display-name`, which
  `orun secrets list --json` returns), and left alone when the fingerprint
  matches.
- **Session secret:** generated once per environment and never replaced,
  since replacing it signs everyone out.

A second run against an unchanged tenant makes no write
(`tests/web/src/bootstrap.test.ts`, and the e2e against the placed site).

## 4. The site before a tenant exists

`next.config.ts` decides once, at build: connected when the tenant's domain
and the whole configuration are present (in a deploy, `AUTH0_CONFIGURED`
stands for the withheld values). Not connected:
- the home page renders a "connect Auth0" notice where the sign-up form
  would be;
- the middleware redirects `/dashboard`, `/onboarding` and `/auth` home;
- nothing constructs an Auth0 client;
- `/api/health` says `not-connected`.

Connected, the site is the template. `/api/health` names any secret a
connected Worker lacks, by name, so the deploy's smoke fails loudly.

## 5. Testing without a tenant

`tests/web/src/fakes/` is a stand-in tenant: an OIDC provider (discovery,
`/authorize`, `/oauth/token` with PKCE, RS256 id_tokens, JWKS, logout) and
the slice of the Management API the bootstrap uses. With it are stand-ins
for the Auth0 CLI and for the orun CLI's secret store. The Auth0 SDK talks
to an `http://` domain only with `allowInsecureRequests`, which
`lib/auth0-clients.ts` sets only when the domain itself is `http://` (a real
tenant never is). So the e2e signs a visitor in on workerd through the real
SDK. The Management API's own SDK (`auth0`) is always https, so the
dashboard's Management API reads are not exercised offline (risk A0-B).

## 6. Rejected

- **Re-implementing the dashboard over a database.** Upstream's design is the
  tenant; a database would fork it.
- **Generating the session secret at deploy time, or deriving it from
  another secret.** It must be stable across deploys; the bootstrap stores
  it once.
- **A Node.js `proxy.ts` with `critters` installed to satisfy the bundler.**
  It adds a deprecated package to paper over a bundler gap; the template's
  own edge middleware builds as it is.
