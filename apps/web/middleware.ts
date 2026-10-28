import { NextResponse, type NextRequest } from "next/server"

import { appClient, onboardingClient } from "./lib/auth0-clients"
import { auth0Connected } from "./lib/auth0-connection"

// Every route that needs the tenant: the dashboard, onboarding and the Auth0
// SDK's own /auth/* routes.
const NEEDS_AUTH0 = /^\/(dashboard|onboarding|auth)(\/|$)/

// Upstream's middleware. Until an Auth0 tenant is
// connected there is no client to hand a request to, so the proxy sends the
// routes that need one home (where the site says how to connect Auth0) and
// lets every other request through.
export async function middleware(request: NextRequest) {
  if (!auth0Connected) {
    if (NEEDS_AUTH0.test(request.nextUrl.pathname)) {
      return NextResponse.redirect(new URL("/", request.url))
    }
    return NextResponse.next()
  }
  if (request.url.includes("/onboarding")) {
    return await onboardingClient.middleware(request)
  } else {
    return await appClient.middleware(request)
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - api/health (the deploy's smoke test, which needs no session)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|icon.png|api/health).*)",
  ],
}
