# Epics

Orun-style work programs. Each epic is a folder carrying `epic.yaml` (the
declaration the platform reads: slug, key prefix, milestones with exit
criteria and task keys) beside its doc set. The pull request that adds the
folder is the adoption; the merge creates the epic in the workspace.

| Epic | Cluster | Status | What it is |
|------|---------|--------|------------|
| [`auth0-saas-starter/`](./auth0-saas-starter/) | **A0** | In progress (A00) | Vercel's SaaStart (Auth0 + Next.js SaaS Starter Kit) — Auth0's B2B SaaS starter on Auth0 Organizations — on Cloudflare Workers + Static Assets through OpenNext, with an idempotent tenant bootstrap that stores the tenant's configuration as Orun secrets, and an Orun baseline that instantiates it (A02) |

As-built ≠ intent: what shipped lives in each epic's `IMPLEMENTATION-STATUS.md`.
