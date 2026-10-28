# auth0-saas-starter — for coding agents

Start here before you change this site. This page is short on purpose: the
pages it points at hold the detail, and they are kept true.

## What this is

Auth0's B2B SaaS starter: sign-up that creates an organization, members,
invitations and roles, self-service SSO and SCIM, MFA and security policies
— all kept in an Auth0 tenant through its Management API, no database —
built by `@opennextjs/cloudflare` into one Cloudflare Worker with Static
Assets. Orun deploys it to `stage` and `prod` on every merge to `main`;
`dev` only verifies. One deployable component (`apps/web`), its tests
(`tests/web`) and the tenant bootstrap (`tooling/auth0`). The site connects
only when the build has the tenant's whole configuration
(`apps/web/lib/auth0-connection.ts`); until then the home page shows a
"connect Auth0" notice where sign-up would be.

## Read first, in this order

1. [README.md](README.md) — what is where, how to run it, the live URLs.
2. [ai/context/operations.md](ai/context/operations.md) — the operating
   contract: how a merge deploys, the secrets model, common operations.
3. [ai/context/deployment.md](ai/context/deployment.md) — what is live, as
   last probed.
4. [apps/web/docs/overview.md](apps/web/docs/overview.md) — the component,
   with `architecture.md` and `runbook.md` beside it.
5. [apps/web/app/site.ts](apps/web/app/site.ts) — the site's name and the
   repository its header links to.
6. [apps/web/lib/auth0-connection.ts](apps/web/lib/auth0-connection.ts) —
   the one switch every Auth0 surface reads, and why.
7. [tooling/auth0/bootstrap.mjs](tooling/auth0/bootstrap.mjs) — what the
   tenant must hold, and how an environment is connected.

## Working on it

```bash
pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm --filter @app/web dev        # http://localhost:3000
```

Local work needs a tenant set up for localhost: `pnpm auth0:bootstrap
--local` writes `apps/web/.env.local`; without it the home page shows the
"connect Auth0" notice. The home page is `apps/web/app/page.tsx`. Every
Auth0 surface — the middleware, a page or action that calls
`appClient`/`onboardingClient`/`managementClient` — runs only when
`auth0Connected` is true (the middleware sends the routes that need Auth0
home otherwise): keep that true of anything you add, or the unconnected
site breaks. Read the tenant's configuration (`process.env.AUTH0_*`) when a
request is handled, never at module load: on Workers it arrives with the
request (`apps/web/lib/lazy.ts`).

## How a change lands

- The repository is desired state. `intent.yaml` declares the environments
  and the workspace; `apps/web/component.yaml` declares how the site is
  built, deployed and smoke-tested.
- `orun plan --changed` shows which components and environments a change
  touches. CI runs the same plan on every pull request.
- One task, one pull request to `main`. On the pull request `ci.yml`'s
  verify lanes run (the site built and dry-deployed per environment); they
  do not lint or run the tests, so run `pnpm typecheck && pnpm lint && pnpm
  test` before you push. The merge's `ci.yml` run deploys stage and prod and
  smoke-tests each. That run is the deployment: retry a red lane with
  `gh run rerun --failed`.
- With Orun's work plane: `orun task create --brief "…"` issues a task key,
  `orun pr open --task <KEY>` opens its pull request on `orun/<KEY>-<slug>`,
  and `orun pr land` merges it once its checks pass. Leave the `BASE` prefix
  to the bootstrap: CI checks `orun/BASE-…` branches with `plan` alone.
- A change to `intent.yaml` alone (a `SITE_URL`, say) deploys nothing;
  carry it with a change under `apps/web`.

## Do not touch

- `execution.state.workspace` in `intent.yaml`: every remote operation, and
  CI's OIDC exchange, claims that workspace.
- `ai/context/deployment.md`, and the README between `<!-- 03-docs:begin -->`
  and `<!-- 03-docs:end -->`: rendered from probed URLs, never by hand.
- `.rebrand/values.json`: the identity the site was created with, which the
  deployment record is rendered from.
- Secrets. `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are brokered
  per run from the workspace's Cloudflare connection; the tenant's
  configuration (`AUTH0_*`, `SESSION_ENCRYPTION_SECRET`, …) is Orun secrets
  per environment the tenant bootstrap writes. Never put a value in the
  repository or in GitHub, and never inline one into a bundle (no
  `NEXT_PUBLIC_` name, no `next.config.ts` `env` entry — the tenant's domain
  alone is public): the deploy hands them to the Worker as Worker secrets.
  List them by name (operations.md).
- `ci.yml` stays the only workflow that runs on a push to `main`.
- `pnpm-lock.yaml` changes through `pnpm install`, never by hand: CI
  installs with `--frozen-lockfile`.
