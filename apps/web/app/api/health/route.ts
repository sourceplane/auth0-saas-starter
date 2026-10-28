import { NextResponse } from "next/server"

import { AUTH0_RUNTIME_SECRETS, auth0Connected } from "@/lib/auth0-connection"

// What every deploy's smoke test reads: whether the Worker holds what its
// build expects. A site built for a connected tenant needs the Auth0
// configuration at request time (Worker secrets the deploy pushes); one
// built without it needs nothing. Names only — never a value.
export const dynamic = "force-dynamic"

export function GET() {
  const missing = auth0Connected
    ? AUTH0_RUNTIME_SECRETS.filter((name) => !process.env[name])
    : []
  const ok = missing.length === 0
  return NextResponse.json(
    {
      ok,
      auth0: auth0Connected ? "connected" : "not-connected",
      ...(ok ? {} : { missing }),
    },
    { status: ok ? 200 : 503 }
  )
}
