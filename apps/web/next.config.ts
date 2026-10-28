import type { NextConfig } from "next"
import path from "node:path"

// An Auth0 tenant is connected when the build's environment has the whole
// configuration the tenant bootstrap stores per environment
// (tooling/auth0/bootstrap.mjs): the tenant's domain, which `next build`
// inlines (the SSO forms show it to customers), and the applications'
// credentials, role ids, connection id, claims namespace and session secret,
// which the Worker reads at request time as Worker secrets the deploy pushes
// (tooling/wire/worker-secrets.mjs) and which no bundle ever contains.
//
// What the build needs of those is that they EXIST. A deploy builds with
// AUTH0_CONFIGURED and without the values themselves (component.yaml's
// buildCommand), so neither the bundles nor the bundler's own cache
// (`.next/cache`, which holds the build's environment) ever see one; a local
// build reads them from `.env.local` (`pnpm auth0:bootstrap --local`).
const RUNTIME = [
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
  "AUTH0_MANAGEMENT_CLIENT_ID",
  "AUTH0_MANAGEMENT_CLIENT_SECRET",
  "SESSION_ENCRYPTION_SECRET",
  "AUTH0_ADMIN_ROLE_ID",
  "AUTH0_MEMBER_ROLE_ID",
  "DEFAULT_CONNECTION_ID",
  "CUSTOM_CLAIMS_NAMESPACE",
]
const domain = process.env.AUTH0_DOMAIN || process.env.NEXT_PUBLIC_AUTH0_DOMAIN || ""
const configured =
  process.env.AUTH0_CONFIGURED === "true" || RUNTIME.every((name) => Boolean(process.env[name]))
const connected = Boolean(domain) && configured

const nextConfig: NextConfig = {
  env: {
    AUTH0_CONNECTED: connected ? "true" : "",
    NEXT_PUBLIC_AUTH0_DOMAIN: connected ? domain : "",
  },
  // The template's images are its own (the logo, icons); no image optimizer
  // runs on Workers.
  images: { unoptimized: true },
  turbopack: {
    // The workspace root: Next resolves `next` and the app's dependencies
    // from the monorepo's node_modules.
    root: path.join(__dirname, "../.."),
  },
  // Required by @opennextjs/cloudflare, which bundles `.next/standalone/**`
  // into the Worker. Trace from the monorepo root so workspace dependencies
  // resolve from the root node_modules.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
}

export default nextConfig
