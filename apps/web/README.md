# apps/web — the site

Auth0's B2B SaaS starter
([auth0-developer-hub/auth0-b2b-saas-starter](https://github.com/auth0-developer-hub/auth0-b2b-saas-starter),
MIT — `LICENSE.md`), running on Cloudflare Workers + Static Assets:

- Sign-up that creates an organization (`app/onboarding`), and the Auth0
  SDK's login, callback and logout under `/auth` (`middleware.ts`)
- The dashboard (`app/dashboard`): the organization's general settings,
  members, invitations and roles, SSO connections (OIDC, SAML) with SCIM
  provisioning and security policies; the account's profile and MFA
- Every organization, member and connection read and written through
  Auth0's Management API (`lib/auth0.ts`); no database
- Radix UI (shadcn/ui), Tailwind v3

The site connects when the build has the tenant's whole configuration
(`lib/auth0-connection.ts`); until then the home page shows a "connect
Auth0" notice where sign-up would be, and the middleware sends the routes
that need Auth0 home. The site's name and the repository it links to are in
`app/site.ts`.

```bash
pnpm auth0:bootstrap --local   # from the repository root: a tenant set up for localhost → .env.local
pnpm dev        # next dev on http://localhost:3000
pnpm build      # next build + opennextjs-cloudflare build → .open-next/
pnpm preview    # wrangler dev over the built Worker (the configuration from .dev.vars)
```

How it is deployed — per environment, on merge to `main` — is the
repository's README and `component.yaml` beside this file.
