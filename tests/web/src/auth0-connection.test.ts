import { afterEach, describe, expect, it, vi } from "vitest";

// lib/auth0-connection.ts and /api/health: what decides whether the site
// offers sign-up, and what every deploy's smoke test reads.
const RUNTIME = [
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
];

afterEach(() => {
  for (const name of [...RUNTIME, "AUTH0_CONNECTED"]) delete process.env[name];
  vi.resetModules();
});

describe("the Auth0 connection", () => {
  it("is off unless the build inlined AUTH0_CONNECTED=true", async () => {
    expect((await import("lib/auth0-connection")).auth0Connected).toBe(false);
    vi.resetModules();
    process.env.AUTH0_CONNECTED = "true";
    expect((await import("lib/auth0-connection")).auth0Connected).toBe(true);
  });

  it("names every secret a connected Worker reads", async () => {
    const { AUTH0_RUNTIME_SECRETS } = await import("lib/auth0-connection");
    expect([...AUTH0_RUNTIME_SECRETS].sort()).toEqual([...RUNTIME].sort());
  });
});

describe("/api/health", () => {
  async function health() {
    const { GET } = await import("app/api/health/route");
    const res = GET();
    return { status: res.status, body: await res.json() };
  }

  it("is ok for a site built without Auth0, which needs no secret", async () => {
    expect(await health()).toEqual({ status: 200, body: { ok: true, auth0: "not-connected" } });
  });

  it("is ok for a connected build whose Worker holds every secret", async () => {
    process.env.AUTH0_CONNECTED = "true";
    for (const name of RUNTIME) process.env[name] = `fixture-${name.toLowerCase()}`;
    expect(await health()).toEqual({ status: 200, body: { ok: true, auth0: "connected" } });
  });

  it("refuses a connected build whose Worker lost a secret, by name, with no value", async () => {
    process.env.AUTH0_CONNECTED = "true";
    for (const name of RUNTIME) process.env[name] = `fixture-${name.toLowerCase()}`;
    delete process.env.SESSION_ENCRYPTION_SECRET;
    const { status, body } = await health();
    expect(status).toBe(503);
    expect(body).toEqual({ ok: false, auth0: "connected", missing: ["SESSION_ENCRYPTION_SECRET"] });
    expect(JSON.stringify(body)).not.toContain("fixture-");
  });
});

describe("the lazy clients (lib/lazy.ts) and the roles (lib/roles.ts)", () => {
  it("builds a client on first use, once, and binds its methods", async () => {
    const { lazy } = await import("lib/lazy");
    let built = 0;
    class Client {
      name = "c";
      hello() {
        return `hi ${this.name}`;
      }
    }
    const client = lazy(() => {
      built++;
      return new Client();
    });
    expect(built).toBe(0);
    // A method read off the proxy keeps its client: upstream passes them around.
    const hello = client.hello as () => string;
    expect(hello()).toBe("hi c");
    expect(client.name).toBe("c");
    expect(built).toBe(1);
  });

  it("loads lib/auth0 with no tenant connected and constructs nothing", async () => {
    const mod = await import("lib/auth0");
    expect(mod.appClient).toBeDefined();
    expect(mod.onboardingClient).toBeDefined();
    expect(mod.managementClient).toBeDefined();
  });

  it("reads the role ids and the claims namespace when used, not when loaded", async () => {
    const { roles, getRole } = await import("lib/roles");
    process.env.AUTH0_ADMIN_ROLE_ID = "rol_admin";
    process.env.AUTH0_MEMBER_ROLE_ID = "rol_member";
    process.env.CUSTOM_CLAIMS_NAMESPACE = "https://claims.example.com";
    expect(roles.admin).toBe("rol_admin");
    expect(roles.member).toBe("rol_member");
    expect(getRole({ sub: "u", "https://claims.example.com/roles": ["admin"] })).toBe("admin");
    expect(getRole({ sub: "u" })).toBe("member");
  });
});
