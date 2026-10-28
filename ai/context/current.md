# auth0-saas-starter — where this repository stands

The entry page for anyone (or any agent) picking this repository up. It is
this repository's own state and does not ship to a site built from it; the
pages that do are [operations.md](operations.md) and
[deployment.md](deployment.md), with the site's `AGENTS.md`.

## What it is

Auth0's B2B SaaS starter (auth0-developer-hub/auth0-b2b-saas-starter, the
template behind Vercel's SaaStart: Auth0 + Next.js SaaS Starter Kit) —
sign-up that creates an organization, members, invitations and roles,
self-service SSO (OIDC, SAML) with SCIM, MFA and security policies, all
kept in an Auth0 tenant through its Management API, with no database —
built by OpenNext into one Cloudflare Worker with Static Assets, packaged as
an Orun baseline: `orun new --blueprint repo-blueprint.yaml` builds a new
site in its own repository and takes it to live on stage and prod in one
landing (`01-product`), then records what went live (`03-docs`). A site is
born without a tenant and shows a "connect Auth0" notice until its owner
runs the tenant bootstrap (`pnpm auth0:bootstrap --env <env>`), which sets a
tenant up and stores its configuration as Orun secrets.

## Release

| | |
|---|---|
| Latest tag | `baseline-v1` — A00 to A02: the repository, the B2B SaaS on Workers, and the baseline (blueprint, phases, tests) |
| Proven live | Not yet: proven offline in Baseline CI only (risk A0-A) |

## Where to read

| Question | Page |
|---|---|
| What shipped, and every departure from upstream | `specs/epics/auth0-saas-starter/IMPLEMENTATION-STATUS.md` |
| Why it is built this way | [decisions.md](decisions.md), then `specs/epics/auth0-saas-starter/design.md` |
| What could still go wrong | [open-risks.md](open-risks.md), then `specs/epics/auth0-saas-starter/risks-and-open-questions.md` |
| How to instantiate it | `BOOTSTRAP.md`, `docs/phases/` |
| What the components are | `apps/web/docs/`, `tests/web/docs/` (generated; `python3 tooling/catalog/gen-component-docs.py`) |

## Next

1. Bootstrap one site from `baseline-v1` from the console and record its
   timings against the 6-minute estimate (closes A0-A); then the registry
   row goes public with the measured minutes.
2. On that site, run the tenant bootstrap against a real (free) Auth0
   tenant for stage, redeploy, and sign up once: an organization created,
   the dashboard read through the Management API (closes A0-B).
