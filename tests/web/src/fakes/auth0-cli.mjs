#!/usr/bin/env node
// A stand-in for the Auth0 CLI, for the tests: the two commands the tenant
// bootstrap runs, against the stand-in tenant at $FAKE_AUTH0_URL
// (auth0-tenant.mjs) — never a real tenant.
//
//   auth0 tenants list --csv        the stand-in as the active tenant
//   auth0 api <method> <path>       the request, its JSON body on stdin; the
//                                   response on stdout, non-zero on an error
import { readFileSync } from "node:fs";

const base = process.env.FAKE_AUTH0_URL;
if (!base) {
  console.error("fake auth0: FAKE_AUTH0_URL is not set");
  process.exit(2);
}
const [cmd, a, b] = process.argv.slice(2);
if (cmd === "tenants" && a === "list") {
  console.log("ACTIVE,DOMAIN");
  console.log(`→,${base}`);
  process.exit(0);
}
if (cmd === "api") {
  const body = readFileSync(0, "utf8");
  const res = await fetch(`${base}/api/v2/${b.replace(/^\//, "")}`, {
    method: a.toUpperCase(),
    headers: body ? { "content-type": "application/json" } : {},
    body: body || undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`=== error: ${res.status} ${text}`);
    process.exit(1);
  }
  process.stdout.write(text);
  process.exit(0);
}
console.error(`fake auth0: unsupported command ${process.argv.slice(2).join(" ")}`);
process.exit(2);
