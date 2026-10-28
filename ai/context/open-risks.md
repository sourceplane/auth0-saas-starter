# auth0-saas-starter — open risks

What is not yet proven or not yet decided. The full write-up of every risk,
including the accepted and resolved ones, is
`specs/epics/auth0-saas-starter/risks-and-open-questions.md`; this page lists
only what is still live, so it should be short.

| ID | Risk | State | What closes it |
|---|---|---|---|
| A0-A | `baseline-v1` is not yet proven live; it is proven offline in Baseline CI (the offline bootstrap, the stage lane's own steps, the site served and smoke-tested unconnected and connected to a stand-in tenant, with a full sign-in) | OPEN | One console bootstrap from the tag, timed |
| A0-B | Nothing has run against a real tenant: the bootstrap's Management API calls, the Actions, organization sign-up and the dashboard's Management API reads are proven against a stand-in only | OPEN | The tenant bootstrap against a free tenant, then one sign-up on stage |
| A0-C | The first Worker-secret push targets a Worker that does not exist yet on a product's very first deploy | WATCH | A fresh product deploys unconnected (nothing to push); connecting it later pushes onto the existing Worker. Verified by the first live connect |
| A0-D | `middleware.ts` is deprecated in Next 16 in favour of `proxy.ts`, which OpenNext cannot bundle for this SDK today | WATCH | Move to `proxy.ts` once OpenNext's Node-middleware bundler resolves Next's optional `critters` (or the SDK stops importing `next/navigation` from its server entry) |

Accepted, and worth knowing before you change them: A0-E (the dashboard
application's and management application's secrets sit in the Worker as
Worker secrets, as upstream keeps them in its env), A0-F (the privacy and
terms pages are Okta's own texts, placeholders an owner must replace).
