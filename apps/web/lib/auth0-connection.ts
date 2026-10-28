// Whether this build was made for a connected Auth0 tenant.
//
// The template has no database: its organizations, members, roles, SSO
// connections and MFA policies all live in an Auth0 tenant, reached with two
// applications' credentials the tenant bootstrap creates
// (tooling/auth0/bootstrap.mjs → the environment's Orun secrets). Until they
// exist there is nothing to sign anyone in with, so next.config.ts decides
// once, at build, from the environment's secrets being present (the secret
// values themselves never reach the build — component.yaml), and inlines
// the answer here. Not connected: the home page says how to connect Auth0
// where the sign-up form would be, and every route that needs Auth0 (the
// dashboard, onboarding, /auth/*) sends the visitor home. Connected: the
// template, unchanged.
export const auth0Connected = process.env.AUTH0_CONNECTED === "true"

// What a connected Worker reads at request time: Worker secrets the deploy
// pushes (tooling/wire/worker-secrets.mjs). /api/health checks them by name.
export const AUTH0_RUNTIME_SECRETS = [
  "AUTH0_DOMAIN",
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
  "AUTH0_MANAGEMENT_CLIENT_ID",
  "AUTH0_MANAGEMENT_CLIENT_SECRET",
  "SESSION_ENCRYPTION_SECRET",
  "AUTH0_ADMIN_ROLE_ID",
  "AUTH0_MEMBER_ROLE_ID",
  "DEFAULT_CONNECTION_ID",
  "CUSTOM_CLAIMS_NAMESPACE",
] as const

// Where an owner starts: a free Auth0 tenant.
export const AUTH0_SIGNUP_URL = "https://auth0.com/signup"
