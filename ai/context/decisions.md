# auth0-saas-starter — decisions

The choices that shape this repository, one line each, with where the full
reasoning lives. Superseded decisions stay listed, marked, so the history
reads in order.

| # | Decision | Why | Source |
|---|---|---|---|
| 1 | Next.js on Workers + Static Assets through `@opennextjs/cloudflare`, with the static-assets incremental cache | Every page that reads a session renders per request; nothing revalidates | `apps/web/open-next.config.ts` |
| 2 | No database: the tenant is the data store | Upstream keeps organizations, members, roles and connections in Auth0 and reads them through the Management API; a database would duplicate it | design §1 |
| 3 | The tenant bootstrap is a command the owner runs once per environment (`pnpm auth0:bootstrap --env <env>`), not a deploy-time hook | Setting a tenant up needs tenant-admin rights (create applications, grants, Actions); a hook would keep such a credential in CI for every deploy. The Auth0 CLI's own login holds it on the owner's machine, and the site needs only what the bootstrap stores | design §3 |
| 4 | The bootstrap is idempotent: objects found by name, created when missing, updated when they differ; each Orun secret carries a fingerprint of its value in its display name; the session secret is generated once | Upstream's script creates everything anew on every run; a second environment, a new origin or a re-run must not duplicate a tenant's applications or sign everyone out | design §3, `tests/web/src/bootstrap.test.ts` |
| 5 | The site connects only when the build has the whole configuration; without it the home page shows a "connect Auth0" notice and the middleware sends `/dashboard`, `/onboarding` and `/auth` home | A fresh product deploys before its owner has a tenant; a partial configuration would fail on its first request | `apps/web/lib/auth0-connection.ts`, `next.config.ts` |
| 6 | The configuration is Orun secrets per environment, read as `optionalSecretEnv`; the domain is inlined by the build, the rest withheld from it (`env -u`, `AUTH0_CONFIGURED` in its place) and pushed to the Worker as Worker secrets | No credential in a bundle, a build cache or a log | `apps/web/component.yaml`, `tooling/wire/worker-secrets.mjs` |
| 7 | The three Auth0 clients are built on first use (`lib/lazy.ts`); every call site is upstream's | On Workers the Worker's secrets reach `process.env` with a request, after module load; an unconnected site must construct nothing | `apps/web/lib/lazy.ts` |
| 8 | Upstream's `middleware.ts` (the edge runtime), not Next 16's `proxy.ts` (Node.js) | OpenNext 1.20.11's Node-middleware bundler cannot resolve `critters`, which the Auth0 SDK's server entry drags in through Next's pages runtime; the edge path builds. Next 16 warns the file convention is deprecated | IMPLEMENTATION-STATUS (departures) |
| 9 | Next 16.3.8, not upstream's ^16.0.10 lock (16.0.10) | OpenNext 1.20.11's floor is 16.3.8 | IMPLEMENTATION-STATUS |
| 10 | `/api/health` and a full-page render are the deploy's smoke | A connected build whose Worker lost a secret fails every signed-in request; the smoke catches it at deploy, naming the missing secret | `apps/web/app/api/health/route.ts` |
| 11 | The site's name is one seam, `SITE_NAME` in `apps/web/app/site.ts`: the title, the header, the copy, the Auth0 objects' names, the domain-verification record's prefix | The rename rewrites one literal | `apps/web/app/site.ts` |
| 12 | Upstream's Heap analytics snippet is removed | It reported every product's visitors to the template author's Heap account | IMPLEMENTATION-STATUS |
| 13 | No custom-domain phase: a domain is the owner's step; `SITE_URL` points the build at it and a bootstrap re-run adds it to the applications | The brokered `workers-deploy` token has no zone rights | README, "Custom domain" |
| 14 | One landing (`01-product`) then the record (`03-docs`), each checked in the build box | A landing has a fixed cost; the convergence on main builds, deploys and smoke-tests the site for real | `repo-blueprint.yaml` |
| 15 | `ci.yml` plans nothing while `intent.yaml` names `ws_CHANGE_ME`; no Checks workflow | A bootstrap cannot set a repository variable; a push to main must start `ci.yml` alone | `.github/workflows/ci.yml` |
| 16 | stack-tectonic 0.19.0, not 0.20.0 | 0.20.0's lane-shared install links `node_modules` out of the job's tree | portfolio-starter-kit's risk PK-J |
| 17 | Component docs are generated from the manifests and checked in CI; orun is pinned only where it runs | A hand-written copy drifts silently | `tooling/catalog/gen-component-docs.py` |
| 18 | `subdomain` is read from the Cloudflare connection, never asked; the console asks for no domain and no Auth0 credential | The first belongs to the account; no platform connection can mint the tenant's configuration | `blueprint.yaml` |
