// The product's identity, written once. The page title, the header, the
// sign-up copy and the names of the Auth0 objects the tenant bootstrap
// creates (tooling/auth0/bootstrap.mjs) all read SITE_NAME; the footer's
// source link is SOURCE_URL. A product built from this baseline gets both
// rewritten to its own name and repository at instantiation, so keep them
// literal and on one line each.
export const SITE_NAME = "SaaStart";
export const SOURCE_URL = "https://github.com/sourceplane/auth0-saas-starter";

// The site's public origin: Auth0's appBaseUrl (its callback and logout URLs)
// and metadataBase. The Orun build sets NEXT_PUBLIC_SITE_URL per environment:
// its SITE_URL from intent.yaml, else its workers.dev URL.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// SITE_NAME as a lower-case slug: the prefix of the DNS record a customer
// adds to verify a domain, and of the tenant's shared database connection.
export const SITE_SLUG =
  SITE_NAME.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "site";
