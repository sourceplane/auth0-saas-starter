# auth0-saas-starter — risks and open questions

| ID | Risk | State | Notes |
|---|---|---|---|
| A0-A | `baseline-v1` is not yet proven live | OPEN | Proven offline in Baseline CI: the offline bootstrap, the stage lane's own steps in their staged tree, the site served unconnected and connected to a stand-in tenant |
| A0-B | Nothing has run against a real tenant | OPEN | The bootstrap's Management API calls, the Actions, organization sign-up and the dashboard's Management API reads are proven against a stand-in only; the OIDC sign-in is proven on workerd against the stand-in |
| A0-C | A Worker-secret push before the Worker exists | WATCH | A fresh product deploys unconnected (nothing to push); connecting later pushes onto the existing Worker |
| A0-D | `middleware.ts` is deprecated in Next 16 | WATCH | `proxy.ts` (Node.js) does not bundle on OpenNext 1.20.11 for this SDK (`critters`); revisit when OpenNext's Node-middleware bundler handles Next's optional modules |
| A0-E | The applications' secrets are Worker secrets | ACCEPTED | As upstream keeps them in its environment; readable by anyone with the account's Worker scripts |
| A0-F | The privacy and terms pages are Okta's texts | ACCEPTED | Placeholders upstream ships; the product README says to replace them |
| A0-G | The claims namespace is upstream's `https://example.com` | ACCEPTED | A namespace for custom claims, not a URL anything fetches; one per tenant, so stage and prod sharing a tenant agree |
| A0-H | Rotating the management application's secret | ACCEPTED | The "Add Default Role" Action holds a copy: re-run the bootstrap with `--refresh-actions` (README) |
