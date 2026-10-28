// OpenNext Cloudflare adapter config.
//
// Every page renders per request in the Worker — Auth0 reads each request's
// session — and nothing revalidates, so the only pre-rendered output is
// Next's own (the 404 page). The static-assets incremental cache serves that
// from the Worker's static assets (read only, no R2/KV/D1 to provision). A
// change that caches renders (ISR, `revalidateTag`, "use cache") swaps this
// for the R2 incremental cache plus a tag cache.
import { defineCloudflareConfig } from "@opennextjs/cloudflare/config";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
