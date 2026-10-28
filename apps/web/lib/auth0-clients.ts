import { Auth0Client } from "@auth0/nextjs-auth0/server"

import { SITE_URL } from "@/app/site"

import { lazy } from "./lazy"

// The two Auth0Client instances upstream's lib/auth0.ts builds — the proxy's
// only import, so the Management API SDK stays out of the middleware bundle.
// lib/auth0.ts re-exports them with the management client, so every call site
// is upstream's.

// The tenant's domain: AUTH0_DOMAIN, a Worker secret, or the build's inlined
// copy (NEXT_PUBLIC_AUTH0_DOMAIN, which the SSO forms show their customers).
export function domain() {
  return process.env.AUTH0_DOMAIN || process.env.NEXT_PUBLIC_AUTH0_DOMAIN
}
function appBaseUrl() {
  return process.env.APP_BASE_URL || SITE_URL
}
// A tenant is always https://. An http:// domain is a local stand-in for one
// (the e2e's mock OIDC provider), which the SDK talks to only when told it may.
function insecure() {
  return Boolean(domain()?.startsWith("http://"))
}

export const onboardingClient = lazy(
  () =>
    new Auth0Client({
      domain: domain(),
      clientId: process.env.AUTH0_MANAGEMENT_CLIENT_ID,
      clientSecret: process.env.AUTH0_MANAGEMENT_CLIENT_SECRET,
      appBaseUrl: appBaseUrl(),
      secret: process.env.SESSION_ENCRYPTION_SECRET,
      allowInsecureRequests: insecure(),
      routes: {
        callback: "/onboarding/callback",
        login: "/onboarding/signup",
        logout: "/",
      },
      authorizationParameters: {
        screen_hint: "signup",
      },
    })
)

export const appClient = lazy(
  () =>
    new Auth0Client({
      domain: domain(),
      clientId: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
      appBaseUrl: appBaseUrl(),
      secret: process.env.SESSION_ENCRYPTION_SECRET,
      allowInsecureRequests: insecure(),
      async beforeSessionSaved(session) {
        // For some reason is needed to delay the session persistance
        // and custom claim to have be stored within the session
        return { ...session }
      },
    })
)
