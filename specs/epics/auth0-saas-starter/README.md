# auth0-saas-starter — Vercel's SaaStart (Auth0 + Next.js SaaS Starter Kit) on Cloudflare Workers

**Auth0's B2B SaaS starter — organizations, members, invitations and roles,
self-service SSO and SCIM, MFA and security policies, all in an Auth0 tenant
through its Management API, no database — built by OpenNext into one
Cloudflare Worker, the Auth0 SDK's middleware running in it, deployed by Orun
to stage and prod on every merge; a site that serves before it has a tenant,
an idempotent tenant bootstrap that sets one up and stores its configuration
as Orun secrets; and the baseline that makes a copy of it somebody else's in
one landing.**

| | |
|---|---|
| Status | ✅ Shipped (`baseline-v1`) — proven offline in Baseline CI; not yet live (risk A0-A) |
| Upstream | [auth0-developer-hub/auth0-b2b-saas-starter](https://github.com/auth0-developer-hub/auth0-b2b-saas-starter) (MIT), at `12ad50e` (2026-02-13) |
| Reference | [portfolio-starter-kit](https://github.com/sourceplane/portfolio-starter-kit) — the scaffolding, tests and bootstrap; [clerk-auth-starter](https://github.com/sourceplane/clerk-auth-starter) — a SaaS auth provider as optional Orun secrets, pushed to the Worker by the deploy; [saas-starter](https://github.com/sourceplane/saas-starter) — the B2B SaaS shape |
| Key | `A0` |

## Read in this order

1. [design.md](design.md) — the template, how each Vercel piece maps to
   Cloudflare, the tenant bootstrap (and the deploy-time hook rejected), the
   site before a tenant exists, and testing without one.
2. [implementation-plan.md](implementation-plan.md) — the milestones and
   what each one lands.
3. [risks-and-open-questions.md](risks-and-open-questions.md) — what is not
   proven, and what was accepted.
4. [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) — what shipped, and
   every departure from the upstream template.

## Milestones

| Milestone | What it lands | Task |
|---|---|---|
| A00 — the spec | the repository, its intent, CI, tooling and spec index; this doc set | A0-1 |
| A01 — the B2B SaaS on Workers | the template in `apps/web`, built by OpenNext into one Worker; the Auth0 switch; the idempotent tenant bootstrap; the Worker-secret push; `tests/web` with a stand-in tenant | A0-2 |
| A02 — a baseline | the console card, the build document, the context pack and the baseline's tests | A0-3 |
