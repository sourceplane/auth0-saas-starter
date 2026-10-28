# auth0-saas-starter — operating contract (for humans and agents)

This is the standing guide to how this site is deployed and operated.
Instance facts (live URLs, workspace, the secrets it uses) live in
[deployment.md](deployment.md), rendered from probed reality by the
bootstrap's `03-docs` phase; this file is the contract that stays true
between deployments. It is written to give an agent with repository read
access enough context to reason about and operate the site without any
other source.

## What this system is

Auth0's B2B SaaS starter on Cloudflare, expressed as an Orun
component-native desired-state repo. Auth0 is a SaaS the site calls, not a
component here: its owner creates the tenant and runs the tenant bootstrap,
which sets it up and stores its configuration as Orun secrets.

- **`apps/web`** — the site: Next.js built by `@opennextjs/cloudflare` into
  one Worker plus Static Assets. The Auth0 SDK's middleware (`middleware.ts`,
  on the edge runtime) mounts `/auth/*` and `/onboarding/*` and reads every
  request's session; `/dashboard/*` manages the visitor's organization
  (members, invitations, roles, SSO connections, SCIM, MFA and security
  policies) through Auth0's Management API with the management
  application's credentials; `/api/health` is what the deploy's smoke reads.
  There is no database: the tenant holds the organizations and their
  members.
- **The Auth0 switch** — `apps/web/lib/auth0-connection.ts`. The build
  connects only when it has the whole configuration (`next.config.ts`);
  without it the home page renders a "connect Auth0" notice where sign-up
  would be and the middleware sends `/dashboard`, `/onboarding` and `/auth`
  home. The three Auth0 clients are built on first use (`lib/lazy.ts`), so
  nothing reads the configuration before a request has it.
- **`tooling/auth0`** — the tenant bootstrap (`pnpm auth0:bootstrap --env
  <env>`): the two applications, the Management API grant, the shared
  connection, the roles, three post-login Actions and their bindings, the
  Universal Login theme, the verification e-mail and the MFA factors,
  created or brought up to date (idempotent), and the configuration stored
  as the environment's Orun secrets.
- **`tests/web`** — the site's identity, the Auth0 switch, the lazy clients
  and roles, the health route, the Worker-secret push and the tenant
  bootstrap against a stand-in tenant (vitest), verified on the `dev` rung.
- **`tooling/*`** — shared TypeScript and ESLint configuration, the
  deploy-time wrangler renderer, and `wire/worker-secrets.mjs`, which hands
  the tenant's configuration to the Worker.

Environments: **`stage`** and **`prod`** are deployed; **`dev` is
verify-only by design** — lanes build and test, nothing deploys.

## Identity and tenancy

Every remote operation runs against ONE Orun workspace, declared in
`intent.yaml` under `execution.state.workspace` — committed, enforced, and
what CI uses. Do not remove it; headless credentials depend on it. If it
reads `ws_SET_ME`, the bootstrap had no workspace to write: set the real one
before anything else.

## How deployment works

1. Merge (or push) to `main`.
2. CI (`.github/workflows/ci.yml`) runs `orun plan --changed` — only
   components whose files changed are planned — then runs each planned lane
   with `orun run --remote-state`, authenticated by GitHub OIDC (the
   exchange resolves this repository's linked workspace server-side).
3. `apps/web` builds once per environment, with `NEXT_PUBLIC_SITE_URL` set to
   that environment's `SITE_URL` (intent.yaml) or its workers.dev URL and
   — once the tenant bootstrap has stored it — told that the environment's
   Auth0 configuration exists; the deploy lane then sets that configuration
   on `auth0-saas-starter-web-<env>` as Worker secrets (`wrangler secret
   bulk`), `wrangler deploy` ships it, and a smoke
   test fetches `/` (rendered to its end) and `/api/health` (ok: the Worker
   holds what its build expects).
4. `prod` deploys after `stage` has converged on the same commit
   (`environments.prod.promotion` in intent.yaml).
5. **The convergence run is the deployment.** A green run means every
   planned lane applied. Failed lanes are retried with
   `gh run rerun --failed`, which resumes the same execution.

Caveats that matter:

- A push that touches no component files plans zero lanes — that run is
  green and deployed nothing. Never treat "latest run green" as "site
  converged"; probe the URLs instead.
- A change to `intent.yaml`'s `environments` (a new `SITE_URL`, say) maps to
  no component and redeploys nothing on its own. Land it with a change under
  `apps/web`.
- Running the tenant bootstrap builds nothing either: the configuration is
  read when the site builds. Redeploy by hand after running it.
- The Auth0 applications' callback, logout and origin lists name each
  environment's origin; a new `SITE_URL` needs the bootstrap run again for
  that environment.
- Every page that reads a session renders per request.

## Secrets model

- **Brokered provider secrets**: `CLOUDFLARE_API_TOKEN` (Workers deploy
  scope) and `CLOUDFLARE_ACCOUNT_ID` — pointers minted per run from the
  workspace's Cloudflare connection. No long-lived values at rest; nothing
  to rotate by hand.
- **The tenant's configuration**, per environment, OPTIONAL, written by the
  tenant bootstrap: `AUTH0_DOMAIN` (public by design; the build inlines it
  into the pages), `AUTH0_CLIENT_ID`/`AUTH0_CLIENT_SECRET` (the dashboard
  application), `AUTH0_MANAGEMENT_CLIENT_ID`/`AUTH0_MANAGEMENT_CLIENT_SECRET`
  (the management application: sign-up and the Management API),
  `AUTH0_ADMIN_ROLE_ID`, `AUTH0_MEMBER_ROLE_ID`, `DEFAULT_CONNECTION_ID`,
  `CUSTOM_CLAIMS_NAMESPACE` and `SESSION_ENCRYPTION_SECRET` (generated once;
  replacing it signs everyone out); `AUTH0_MANAGEMENT_API_DOMAIN` only for a
  tenant on a custom domain. The build runs without any of them but the
  domain, told only that they exist (`AUTH0_CONFIGURED`), so no bundle or
  build cache holds one; the deploy lane hands them to the Worker as Worker
  secrets, the values over stdin. `apps/web/component.yaml` reads them as
  `optionalSecretEnv`: a key nobody stored is skipped, and the site builds
  without Auth0. Each is stored with a fingerprint of its value in its
  display name, which is how a re-run of the bootstrap knows to leave it
  alone. Rotate an application's secret in the Auth0 dashboard, run the
  bootstrap again (`--refresh-actions`: an Action holds the management
  secret) and redeploy.
- Inspect by NAME only: `orun secrets list --org <ws> --project` and
  `--env stage|prod`. No tooling in this repository prints a secret value,
  and no document in `ai/context/` may contain one. `/api/health` reports
  which of the tenant's secrets the Worker lacks, by name, never a value.

## Verifying the system

```bash
# the site on each environment (also recorded, probed, in deployment.md)
curl -s -o /dev/null -w '%{http_code}\n' https://auth0-saas-starter-web-stage.your-workers-subdomain.workers.dev/
curl -s https://auth0-saas-starter-web-prod.your-workers-subdomain.workers.dev/api/health   # {"ok":true,"auth0":"connected"|"not-connected"}

# workspace readiness (integrations + repository link)
orun integrations list --org <ws> --json && orun cloud check --org <ws>
```

## Common operations

| task | how |
|---|---|
| connect Auth0 | `auth0 login` to the tenant, `pnpm auth0:bootstrap --env <env>` (`--dry-run` first to see the plan), deploy by hand (README, "Connect Auth0") |
| check the tenant against what the site needs | `pnpm auth0:bootstrap --env <env> --dry-run` — every object it would create or update, nothing changed |
| run it locally | `pnpm auth0:bootstrap --local` (writes `apps/web/.env.local`), `pnpm --filter @app/web dev` |
| change the site's code | `apps/web/app/`, its name `apps/web/app/site.ts`; merge |
| deploy a change | merge to `main`; watch the run; failed lanes → `gh run rerun --failed` |
| deploy by hand | Orunbase's Deploy button, or `gh workflow run ci.yml --ref main -f environment=<env> [-f component=<a,b>]` — the named components (blank: every one) run in that environment as a merge runs them; started off `main` it is refused |
| redeploy without a change | edit the last line of `apps/web/component.yaml` (`# orun: redeploy <reason> <stamp>`) and merge — it is a deploy trigger, nothing reads it |
| serve a custom domain | attach it to the Worker in Cloudflare, set `SITE_URL` for the environment in `intent.yaml`, and replace the placeholder `auth0-saas-starter.example.com` in `intent.yaml`'s `BASE_DOMAIN` (dev, stage and prod) with it (README, "Custom domain") |
| add a runtime secret | `orun secrets set <KEY> --org <ws> --env <env>`, then an `optionalSecretEnv` entry in `apps/web/component.yaml` and a `--secret <KEY>` on its `worker-secrets.mjs` call |
| headless credentials | `ORUN_TOKEN` (workspace-scoped) + `GITHUB_TOKEN` |

The deployment record is the bootstrap's `03-docs` phase. Re-running it (the
Orun console's Retry on that phase, or `orun new … --phase 03-docs`)
re-probes the URLs and re-renders [deployment.md](deployment.md); it is
idempotent.

## Evolution

The Auth0 tenant owns the users, sessions, organizations and their
connections; a feature that needs data of the site's own (a billing table,
say) adds a data store. Structural
changes (a second Worker, an API, a data store) follow the same
contract that deployed the site: add a component under `apps/`, `infra/` or
`packages/` with a `component.yaml`, land it as a pull request, and the
convergence run applies it.
