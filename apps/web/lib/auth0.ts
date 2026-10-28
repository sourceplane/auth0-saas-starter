import { ManagementClient } from "auth0"

import { appClient, domain, onboardingClient } from "./auth0-clients"
import { lazy } from "./lazy"

// Upstream's three clients, each built on first use (lib/lazy.ts). The two
// Auth0Client instances live in lib/auth0-clients.ts, which the proxy imports
// alone.
export { appClient, onboardingClient }

export const managementClient = lazy(
  () =>
    new ManagementClient({
      domain: process.env.AUTH0_MANAGEMENT_API_DOMAIN || domain()!,
      clientId: process.env.AUTH0_MANAGEMENT_CLIENT_ID!,
      clientSecret: process.env.AUTH0_MANAGEMENT_CLIENT_SECRET!,
    })
)
