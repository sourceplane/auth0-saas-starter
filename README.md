# auth0-saas-starter

[Vercel's SaaStart: Auth0 + Next.js SaaS Starter Kit](https://github.com/auth0-developer-hub/auth0-b2b-saas-starter) on
**Cloudflare Workers**, deployed by [Orun](https://github.com/sourceplane/orun) to stage
and prod on every merge, and then packaged as an Orun baseline.

This commit is the repository's frame: `intent.yaml` (with the placeholder
workspace `ws_CHANGE_ME`, so CI plans nothing until it is linked), the Orun
CI workflow, the shared TypeScript and ESLint configuration, and the spec
index. The work is tracked as an epic under [`specs/epics`](specs/epics/README.md).
