# auth0-saas-starter

A multi-tenant B2B SaaS on [Auth0](https://auth0.com) Organizations — sign-up
that creates an organization, members, invitations and roles, self-service
single sign-on (OIDC and SAML) with SCIM provisioning, MFA enrollment and
per-organization security policies — as a Next.js app on **Cloudflare
Workers + Static Assets** through
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare). It has no
database of its own: every organization, member, role and connection lives
in your Auth0 tenant, reached through its Management API.

Working on it with a coding agent? [AGENTS.md](AGENTS.md) says what to read
first, how a change lands and what not to touch.

## Live deployment

<!-- 03-docs:begin -->
Not recorded yet. The bootstrap's last phase writes the live URLs, the
workspace and the secrets the site uses into
[ai/context/deployment.md](ai/context/deployment.md); how the site deploys
and how to operate it is in
[ai/context/operations.md](ai/context/operations.md).
<!-- 03-docs:end -->

## Connect Auth0

The site deploys and serves before it has a tenant: until its build is given
a tenant's configuration, the home page shows a **"connect Auth0"** notice
where the sign-up form would be, every route that needs Auth0 (`/dashboard`,
`/onboarding`, `/auth/*`) sends the visitor home, and `/api/health` reports
`"auth0":"not-connected"`. To turn sign-up on:

1. **Create a tenant** at [auth0.com](https://auth0.com/signup) (one for
   stage and prod, or one each), install the
   [Auth0 CLI](https://github.com/auth0/auth0-cli) and sign it in to the
   tenant: `auth0 login`.
2. **Run the tenant bootstrap** from this repository, once per deployed
   environment (with the [orun CLI](https://github.com/sourceplane/orun)
   signed in to the workspace):

   ```bash
   pnpm auth0:bootstrap --env stage
   pnpm auth0:bootstrap --env prod
   ```

   It sets the tenant up the way the site needs it — two applications
   (`<site name> Management` and `<site name> Dashboard`), the Management
   API grant, a shared database connection, the `admin` and `member` roles,
   three post-login Actions and their bindings, the Universal Login theme,
   the verification e-mail and the WebAuthn and one-time-password MFA
   factors — adding the environment's origin to the applications' callback,
   logout and origin lists. Then it stores the configuration as this
   repository's Orun secrets for that environment: `AUTH0_DOMAIN`, the two
   applications' ids and secrets, the role ids, the connection's id, the
   claims namespace and a session secret it generates once. It is safe to
   run again: it creates only what is missing, updates only what differs,
   and leaves a secret alone when its value has not changed
   (`--dry-run` says what it would do). It prints names, never a value. The
   origin is the environment's `SITE_URL` in `intent.yaml`, else its
   workers.dev URL; pass `--origin` to name another.
3. **Redeploy the site**: a secret is read when the site builds, and setting
   one builds nothing. Use **Deploy by hand** below, or change the stamp on
   the last line of `apps/web/component.yaml` (`# orun: redeploy …`) and
   merge. The build inlines the tenant's domain into the pages and is told
   only that the rest exists; the deploy hands the rest to the Worker as
   Worker secrets (`wrangler secret bulk`), so no credential is in a bundle,
   a build cache or a log. From that deploy on, the home page is the sign-up
   form, `/dashboard` sends a signed-out visitor to Auth0's login, and
   `/api/health` reports `"auth0":"connected"` — and the deploy's smoke test
   fails if the Worker ever lacks a secret its build expects.

If you rotate the management application's secret, run the bootstrap with
`--refresh-actions`: the "Add Default Role" Action holds a copy of it.

To run it locally: `pnpm auth0:bootstrap --local` sets the tenant up for
`http://localhost:3000` and writes `apps/web/.env.local` (never committed);
then `pnpm --filter @app/web dev`. `wrangler dev`
(`pnpm --filter @app/web preview`) reads the same values from
`apps/web/.dev.vars`.

## What is here

| Surface | Where |
|---|---|
| The site's name and source link | `apps/web/app/site.ts` |
| Whether Auth0 is connected, and the notice until it is | `apps/web/lib/auth0-connection.ts`, `apps/web/components/connect-auth0.tsx`, `apps/web/next.config.ts` |
| Home, onboarding (`/onboarding/*`), the dashboard (`/dashboard/*`: the organization's members, SSO, security policies; the account's profile and MFA) | `apps/web/app` |
| The Auth0 clients (built on first use) and the middleware | `apps/web/lib/auth0.ts`, `apps/web/lib/auth0-clients.ts`, `apps/web/middleware.ts` |
| `/api/health` (the deploy's smoke) | `apps/web/app/api/health` |
| The tenant bootstrap, its Actions, theme and e-mail | `tooling/auth0` |
| The Worker-secret push | `tooling/wire/worker-secrets.mjs` |
| Workers build and deploy contract | `apps/web/next.config.ts`, `open-next.config.ts`, `wrangler.jsonc`, `component.yaml` |
| Tests | `tests/web` (vitest; `tests/web/src/fakes` is a stand-in tenant the bootstrap's tests run against) |

## Getting started

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build            # next build + opennextjs-cloudflare build → apps/web/.open-next
```

```bash
pnpm --filter @app/web dev        # http://localhost:3000
pnpm --filter @app/web preview    # wrangler dev over the built Worker
```

Build-time variables:

| Variable | What it does |
|---|---|
| `AUTH0_DOMAIN` | The tenant's domain. With the rest of the configuration (Connect Auth0), the site builds connected; without, it builds the "connect Auth0" site. |
| `NEXT_PUBLIC_SITE_URL` | The site's public origin: Auth0's base URL for its callback and logout URLs, and `metadataBase`. The deploy sets it per environment (see below). Defaults to `http://localhost:3000`. |

## How it deploys

Merges to `main` converge through [Orun](https://github.com/sourceplane/orun):
`.github/workflows/ci.yml` plans the changed components and runs each lane
against the workspace in `intent.yaml`. The site deploys to `stage`, then to
`prod` once stage has converged on the same commit; `dev` only verifies. The
Worker is `auth0-saas-starter-web-<env>` on your account's workers.dev
subdomain, and every deploy is smoke-tested over HTTP: the home page renders
to its end, and `/api/health` answers ok. A pull request runs the same
pipeline's verify lanes: the site built and dry-deployed for each
environment, with nothing deployed. They do not lint or run the tests, so
run `pnpm typecheck`, `pnpm lint` and `pnpm test` before you push. (A push
to `main` builds, deploys and smoke-tests.)

The pipeline holds one credential, GitHub's own `GITHUB_TOKEN`. The
Cloudflare token and account id are brokered per run from the workspace's
Cloudflare connection, and the tenant's configuration is Orun secrets;
nothing provider-shaped is stored in the repository or in GitHub.

**Deploy by hand.** Orunbase's **Deploy** button on a component, or **Run
workflow** on the CI workflow in GitHub's Actions tab (on `main`), runs
`ci.yml` for the environment and components you pick, and each one deploys
exactly as a merge would deploy it. Leave the component blank to redeploy
every component in that environment, with nothing changed: after running the
tenant bootstrap, say. A component with nothing to run in that environment
(a test suite in `prod`) is left out with a notice.

## Custom domain

The site answers on workers.dev from its first deploy. To serve it on your
own domain:

1. Add the domain to the Cloudflare account the site deploys into, and attach
   it to the Worker (dashboard → Workers & Pages →
   `auth0-saas-starter-web-prod` → Settings → Domains & Routes → Add →
   Custom domain). Do the same for stage with a subdomain if you want one.
2. Set the environment's public origin in `intent.yaml`, so Auth0's
   callbacks and the site's links use it (until then they use the
   workers.dev URL):

   ```yaml
   environments:
     prod:
       env:
         SITE_URL: https://auth0-saas-starter.example.com
   ```

   The site was born with the reserved placeholder
   `auth0-saas-starter.example.com` where its domain goes: that example,
   and `BASE_DOMAIN` under each environment (dev, stage and prod) in
   `intent.yaml`. Replace it with your domain in the same change.
3. Run the tenant bootstrap for the environment again
   (`pnpm auth0:bootstrap --env prod`): it adds the new origin to the
   applications' callback, logout and origin lists.
4. Merge. The next deploy of `apps/web` builds with the new origin. (A change
   to `intent.yaml` alone deploys nothing — touch `apps/web` in the same pull
   request, or let the next change to the site carry it.)

## Before you go live

The privacy policy (`/privacy`) and terms (`/terms`) are the template's —
Okta's own texts, kept as placeholders. Replace them with yours. The logo and
icons are Auth0's marks; replace them too.

## Credits

The site is Auth0's B2B SaaS starter
([auth0-developer-hub/auth0-b2b-saas-starter](https://github.com/auth0-developer-hub/auth0-b2b-saas-starter),
MIT — `apps/web/LICENSE.md`), the template behind Vercel's SaaStart: Auth0 +
Next.js SaaS Starter Kit.
