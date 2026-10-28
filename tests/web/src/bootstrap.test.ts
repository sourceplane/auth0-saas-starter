import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startTenant } from "./fakes/auth0-tenant.mjs";

// tooling/auth0/bootstrap.mjs, run as its owner runs it — `pnpm
// auth0:bootstrap --env <env>` — against a stand-in tenant and a stand-in
// Orun secret store (./fakes): never a real tenant, never a real workspace.
const ROOT = path.resolve(__dirname, "../../..");
const SCRIPT = path.join(ROOT, "tooling/auth0/bootstrap.mjs");
const FAKES = path.join(__dirname, "fakes");

type Tenant = { origin: string; state: Record<string, any>; writes: string[]; close(): Promise<void> };
let tenant: Tenant;
let dir: string;

beforeAll(async () => {
  tenant = await startTenant();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "auth0-bootstrap-"));
});
afterAll(async () => {
  await tenant.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

// Async: the stand-in tenant answers from this process, so a synchronous
// spawn would wait on a server it is blocking.
function bootstrap(...args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      env: {
        ...process.env,
        FAKE_AUTH0_URL: tenant.origin,
        FAKE_ORUN_STATE: path.join(dir, "orun.json"),
        AUTH0_CLI: path.join(FAKES, "auth0-cli.mjs"),
        ORUN_CLI: path.join(FAKES, "orun-cli.mjs"),
      },
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`bootstrap ${args.join(" ")} failed:\n${out}\n${err}`)),
    );
  });
}
const store = () => JSON.parse(fs.readFileSync(path.join(dir, "orun.json"), "utf8"));
const versions = (env: string) =>
  Object.fromEntries(Object.entries(store()[env]).map(([k, v]: [string, any]) => [k, v.version]));

const STAGE = "https://acme-web-stage.acme.workers.dev";
const PROD = "https://app.example.com";

describe("the tenant bootstrap", () => {
  it("creates the tenant's objects and stores the configuration as Orun secrets", async () => {
    const out = await bootstrap("--env", "stage", "--origin", STAGE);
    const { state } = tenant;
    const names = state.clients.map((c: any) => c.name).sort();
    expect(names).toEqual([expect.stringMatching(/ Dashboard$/), expect.stringMatching(/ Management$/)]);
    const dashboard = state.clients.find((c: any) => c.name.endsWith(" Dashboard"));
    expect(dashboard.callbacks).toEqual([`${STAGE}/auth/callback`]);
    expect(dashboard.organization_usage).toBe("require");
    expect(state.grants).toHaveLength(1);
    expect(state.grants[0].scope).toContain("create:organizations");
    expect(state.roles.map((r: any) => r.name).sort()).toEqual(["admin", "member"]);
    expect(state.actions.map((a: any) => a.name).sort()).toEqual(["Add Default Role", "Add Role to Tokens", "Security Policies"]);
    expect(state.actions.every((a: any) => a.all_changes_deployed)).toBe(true);
    expect(state.bindings.map((b: any) => b.display_name)).toEqual(["Add Default Role", "Add Role to Tokens", "Security Policies"]);
    expect(state.factors.filter((f: any) => f.enabled).map((f: any) => f.name).sort()).toEqual(["otp", "webauthn-roaming"]);
    expect(state.email.resultUrl).toBe("{{ application.callback_domain }}/onboarding/create");

    const secrets = store().stage;
    expect(Object.keys(secrets).sort()).toEqual([
      "AUTH0_ADMIN_ROLE_ID",
      "AUTH0_CLIENT_ID",
      "AUTH0_CLIENT_SECRET",
      "AUTH0_DOMAIN",
      "AUTH0_MANAGEMENT_CLIENT_ID",
      "AUTH0_MANAGEMENT_CLIENT_SECRET",
      "AUTH0_MEMBER_ROLE_ID",
      "CUSTOM_CLAIMS_NAMESPACE",
      "DEFAULT_CONNECTION_ID",
      "SESSION_ENCRYPTION_SECRET",
    ]);
    expect(secrets.AUTH0_CLIENT_ID.value).toBe(dashboard.client_id);
    expect(secrets.AUTH0_CLIENT_SECRET.value).toBe(dashboard.client_secret);
    expect(secrets.SESSION_ENCRYPTION_SECRET.value).toMatch(/^[0-9a-f]{64}$/);
    // The tenant it prints; a secret's value, never.
    for (const name of ["AUTH0_CLIENT_SECRET", "AUTH0_MANAGEMENT_CLIENT_SECRET", "SESSION_ENCRYPTION_SECRET"]) {
      expect(out).toContain(name);
      expect(out).not.toContain(secrets[name].value);
    }
  });

  it("changes nothing on a second run", async () => {
    const before = tenant.writes.length;
    const v = versions("stage");
    const out = await bootstrap("--env", "stage", "--origin", STAGE);
    expect(tenant.writes.slice(before)).toEqual([]);
    expect(versions("stage")).toEqual(v);
    expect(out).toContain("Nothing to change");
  });

  it("writes nothing in a dry run", async () => {
    const before = tenant.writes.length;
    const v = versions("stage");
    await bootstrap("--env", "prod", "--origin", PROD, "--dry-run");
    expect(tenant.writes.slice(before)).toEqual([]);
    expect(store().prod ?? {}).toEqual({});
    expect(versions("stage")).toEqual(v);
  });

  it("serves a second environment from the same tenant: its origin added, stage's kept", async () => {
    const clients = tenant.state.clients.length;
    await bootstrap("--env", "prod", "--origin", PROD);
    expect(tenant.state.clients).toHaveLength(clients);
    const dashboard = tenant.state.clients.find((c: any) => c.name.endsWith(" Dashboard"));
    expect(dashboard.callbacks).toEqual([`${STAGE}/auth/callback`, `${PROD}/auth/callback`]);
    expect(dashboard.allowed_logout_urls).toEqual([STAGE, PROD]);
    const { stage, prod } = store();
    expect(prod.AUTH0_CLIENT_ID.value).toBe(stage.AUTH0_CLIENT_ID.value);
    // One session secret per environment, each generated once.
    expect(prod.SESSION_ENCRYPTION_SECRET.value).not.toBe(stage.SESSION_ENCRYPTION_SECRET.value);
    const before = tenant.writes.length;
    await bootstrap("--env", "prod", "--origin", PROD);
    expect(tenant.writes.slice(before)).toEqual([]);
  });

  it("replaces a secret whose value no longer matches its fingerprint, and keeps the session secret", async () => {
    const file = path.join(dir, "orun.json");
    const s = store();
    s.stage.AUTH0_CLIENT_ID.displayName = "set by hand";
    const session = s.stage.SESSION_ENCRYPTION_SECRET.value;
    fs.writeFileSync(file, JSON.stringify(s));
    await bootstrap("--env", "stage", "--origin", STAGE);
    const after = store().stage;
    expect(after.AUTH0_CLIENT_ID.version).toBe(2);
    expect(after.AUTH0_CLIENT_ID.displayName).toMatch(/^auth0-bootstrap [0-9a-f]{16}$/);
    expect(after.SESSION_ENCRYPTION_SECRET.value).toBe(session);
  });
});
