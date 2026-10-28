# auth0-saas-starter

Auth0's [B2B SaaS starter](https://github.com/auth0-developer-hub/auth0-b2b-saas-starter)
(Vercel's "SaaStart: Auth0 + Next.js SaaS Starter Kit" template) — sign-up
that creates an organization, members, invitations and roles, self-service
SSO (OIDC and SAML) with SCIM provisioning, MFA enrollment and
per-organization security policies, all kept in an Auth0 tenant through its
Management API, with no database of its own — running on **Cloudflare
Workers + Static Assets** through
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare), deployed by
[Orun](https://github.com/sourceplane/orun) to stage and prod on every merge.
Packaging it as an Orun baseline is the next milestone (A02).

The template's code is the code. What the port adds is the Workers build,
the monorepo wrapper, a test package and the deploy contract; what it
changes is what Workers and a fresh, unattended deployment force:
- upstream's tenant-bootstrap CLI, which created everything anew on every
  run and wrote `.env.local`, is an idempotent command the owner runs once
  per environment, storing the tenant's configuration as Orun secrets;
- the build inlines only the tenant's domain and hands the rest to the
  Worker as Worker secrets;
- the site renders a "connect Auth0" notice until a tenant is set up;
- the three Auth0 clients are built on first use;
- upstream's edge middleware is kept, because OpenNext cannot bundle Next
  16's Node.js `proxy.ts` for this SDK;
- the template's Heap analytics snippet is gone.

See [`specs/epics/auth0-saas-starter`](specs/epics/auth0-saas-starter/README.md)
for the design, the milestones and the as-built status, including every
departure.

## What is here (the site)

| Surface | Where |
|---|---|
| The site's name, source link and origin | `apps/web/app/site.ts` |
| Whether Auth0 is connected, and the notice until it is | `apps/web/lib/auth0-connection.ts`, `apps/web/next.config.ts`, `apps/web/components/connect-auth0.tsx` |
| Home, onboarding, the dashboard (organization, members, SSO, security policies, account) | `apps/web/app` |
| The Auth0 clients (built on first use) and the middleware | `apps/web/lib/auth0.ts`, `apps/web/lib/auth0-clients.ts`, `apps/web/middleware.ts` |
| `/api/health` (the deploy's smoke) | `apps/web/app/api/health` |
| The tenant bootstrap (`pnpm auth0:bootstrap`), its Actions, theme and e-mail | `tooling/auth0` |
| The Worker-secret push (the tenant's configuration) | `tooling/wire/worker-secrets.mjs` |
| Workers build and deploy contract | `apps/web/next.config.ts`, `open-next.config.ts`, `wrangler.jsonc`, `component.yaml` |
| Tests | `tests/web` (vitest) |

## Getting started

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build            # next build + opennextjs-cloudflare build → apps/web/.open-next
```

The build needs no tenant: without one the site is the "connect Auth0"
site. With a tenant set up for localhost (`pnpm auth0:bootstrap --local`,
which writes `apps/web/.env.local`), `pnpm --filter @app/web dev` is the
template as Auth0 ships it.

## How it maps to Vercel

| Vercel | Here |
|---|---|
| Next.js hosting, `middleware.ts` (the Auth0 SDK's) on Vercel's Edge runtime | One Cloudflare Worker (`.open-next/worker.js`) + Static Assets; the middleware runs in the Worker (OpenNext's edge middleware) |
| `pnpm auth0:bootstrap` — the Auth0 CLI creating the tenant's applications, grant, connection, roles, Actions, theme, e-mail and MFA factors anew, then writing `.env.local` for one origin (`http://localhost:3000`) | The same objects, found by name and created or updated only when they differ, the environment's origin added to the applications' lists, and the configuration stored as that environment's Orun secrets (each with a fingerprint, the session secret generated once); `--local` still writes `.env.local` |
| Project env vars in Vercel (`AUTH0_*`, `SESSION_ENCRYPTION_SECRET`, …) | Orun secrets per environment, read by the build as optional refs; the domain inlined, the rest Worker secrets every deploy sets |
| Missing configuration (an error on every page) | The "connect Auth0" site: the home page says how to connect, `/dashboard`, `/onboarding` and `/auth` send the visitor home — until the configuration is stored |
| Clients built at module load | Built on first use: on Workers the Worker's secrets reach `process.env` with a request |
| Heap analytics (the template author's app id) | Removed |
| Hard-coded `saastart.app` `metadataBase`, `APP_BASE_URL` set by hand | `NEXT_PUBLIC_SITE_URL`, set per environment by the deploy; Auth0's base URL follows it |
| "Deploy to Vercel" button (clone the template) | The site's own source link; `orun new --blueprint repo-blueprint.yaml` is the clone — a new repository, branded, deployed |
| Deploy on push | Orun deploys `<repo>-web-{stage,prod}` on merge to `main` (`apps/web/component.yaml`), smoke-tested |

## CI

| Workflow | What it runs | Ships to a site |
|---|---|---|
| `ci.yml` | the Orun pipeline, and the only workflow a site carries: `orun plan --changed`, then one job per lane. A pull request runs the verify lanes (the site built and dry-deployed per environment; the tests' `quick-check` lane installs and checks the package, it does not run them), except the bootstrap's own landings (`orun/BASE-*`), where `plan` alone is the check; a merge deploys stage → prod. It plans nothing while `intent.yaml` names the placeholder workspace `ws_CHANGE_ME`, as this repository does. A manual run (Orunbase's Deploy button, or Run workflow on `main`) plans the environment and components it names under the push-to-main trigger, so they deploy as a merge deploys them | yes |
