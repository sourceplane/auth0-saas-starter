# auth0-saas-starter — implementation plan

| Task | Branch | What lands |
|---|---|---|
| A0-1 | `orun/A0-1-the-spec` | This doc set, `epic.yaml` and the three task contracts |
| A0-2 | `orun/A0-2-the-b2b-saas-on-workers` | `apps/web` (the template ported), `tests/web` (with the stand-in tenant), `tooling/auth0` (the idempotent tenant bootstrap), `tooling/wire`, the README |
| A0-3 | `orun/A0-3-becomes-a-baseline` | The card, the build document, `.baseline/`, the phase pages, the context pack, the baseline's tests |

## A0-2 — the B2B SaaS on Workers

1. Upstream at `12ad50e` into `apps/web`: `app`, `components`, `lib`,
   `public`, `types`, its Tailwind and PostCSS configs; its `middleware.ts`
   kept; its LICENSE as `LICENSE.md`.
2. Next 16.3.8 (OpenNext's floor), every other dependency at upstream's
   locked version; ESLint as upstream's `next/core-web-vitals` in flat form.
3. The connection switch, the lazy clients, `/api/health`, the "connect
   Auth0" notice; the name seam.
4. `tooling/auth0/bootstrap.mjs`: upstream's steps, each made find-or-create,
   writing Orun secrets; the Actions, theme and e-mail beside it.
5. The deploy contract: the optional secret refs, the build without the
   credentials, the Worker-secret push.
6. Tests: the identity, the switch and health route, the lazy clients and
   roles, the secret push, the bootstrap against the stand-in tenant.

## A0-3 — a baseline

portfolio-starter-kit's (current) machinery, as clerk-auth-starter carries
it, with `tooling-auth0` placed by `01-product`, the deployment record naming
the tenant's secrets, and the e2e's connected tier: the placed site's own
bootstrap twice against the stand-in, then a build with exactly the secrets
it stored, served, signed in and out.
