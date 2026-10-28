#!/usr/bin/env node
// The tenant bootstrap: everything the product needs in an Auth0 tenant, for
// one environment, created or brought up to date — and its configuration
// stored as that environment's Orun secrets, where the deploy reads it.
//
//   pnpm auth0:bootstrap --env stage          # then prod; then redeploy web
//   pnpm auth0:bootstrap --local              # apps/web/.env.local, for next dev
//
// Options:
//   --env <name>      the Orun environment whose secrets it writes (stage, prod)
//   --origin <url>    the environment's public origin (default: its SITE_URL in
//                     intent.yaml, else its workers.dev URL from
//                     apps/web/component.yaml); with --local, http://localhost:3000
//   --domain <host>   the tenant (default: the Auth0 CLI's active tenant)
//   --refresh-actions redeploy the three Actions even when their code is
//                     unchanged (after rotating the management client's secret)
//   --dry-run         read the tenant and say what would change; change nothing
//
// What it needs: the Auth0 CLI (https://github.com/auth0/auth0-cli), signed in
// to the tenant (`auth0 login`); for --env, the orun CLI signed in to the
// workspace (`orun auth login`), run from this repository (its linked project).
// It talks to the tenant only through `auth0 api` with each request body on
// stdin, and to Orun only through `orun secrets` with each value on stdin: no
// value is ever on a command line, and it prints names, never a value.
//
// IDEMPOTENT. Upstream's script (auth0-b2b-saas-starter scripts/bootstrap.mjs)
// creates everything anew on every run. This one finds each object by name and
// creates it only when it is missing, updates it only when it differs, and
// keeps what it finds:
//   - the two applications ("<SITE_NAME> Management", "<SITE_NAME> Dashboard"):
//     this environment's origin is ADDED to their callback, logout and origin
//     lists, so one tenant can serve stage and prod (or each its own tenant);
//   - the management client's grant, the shared database connection, the admin
//     and member roles, the three post-login Actions and their bindings, the
//     Universal Login theme, the verification e-mail and the MFA factors;
//   - the Orun secrets: each is written with a fingerprint of its value in its
//     display name, and left alone when the fingerprint matches; the session
//     secret is generated once per environment and never replaced.
// A second run against an unchanged tenant changes nothing.
import { spawnSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

// ── arguments ────────────────────────────────────────────────────────────────
function flag(name) {
  return process.argv.includes(`--${name}`);
}
function option(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const local = flag("local");
const env = option("env");
const dryRun = flag("dry-run");
const refreshActions = flag("refresh-actions");
if (!local && !env) {
  console.error("usage: auth0:bootstrap --env <environment> [--origin <url>] [--domain <host>] [--refresh-actions] [--dry-run]");
  console.error("       auth0:bootstrap --local   (writes apps/web/.env.local for next dev)");
  process.exit(2);
}
if (env && !/^[a-z][a-z0-9-]*$/.test(env)) {
  console.error(`auth0:bootstrap: --env ${env} is not an environment name`);
  process.exit(2);
}

const AUTH0 = process.env.AUTH0_CLI || "auth0";
const ORUN = process.env.ORUN_CLI || "orun";

// ── the product's name and origin, from the tree ─────────────────────────────
const siteTs = readFileSync(path.join(root, "apps/web/app/site.ts"), "utf8");
const SITE_NAME = JSON.parse(siteTs.match(/SITE_NAME = ("(?:[^"\\]|\\.)*")/)[1]);
const SITE_SLUG =
  SITE_NAME.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "site";

function environmentOrigin(name) {
  // intent.yaml: environments.<name>.env.SITE_URL (a custom domain), else the
  // Worker's workers.dev URL — the origin the build gives the site.
  const intent = readFileSync(path.join(root, "intent.yaml"), "utf8").split("\n");
  let inEnvs = false;
  let inThis = false;
  for (const line of intent) {
    if (/^environments:/.test(line)) inEnvs = true;
    else if (/^\S/.test(line)) inEnvs = false;
    if (!inEnvs) continue;
    const m = line.match(/^ {2}([a-z][a-z0-9-]*):/);
    if (m) inThis = m[1] === name;
    const url = inThis && line.match(/^\s+SITE_URL:\s*"?([^"\s#]+)"?/);
    if (url) return url[1].replace(/\/+$/, "");
  }
  const component = readFileSync(path.join(root, "apps/web/component.yaml"), "utf8");
  const worker = component.match(/^\s+workerName:\s*(\S+)/m)[1];
  const sub = component.match(/^\s+workersDevSubdomain:\s*(\S+)/m)[1];
  return `https://${worker}-${name}.${sub}.workers.dev`;
}
const origin = (option("origin") || (local ? "http://localhost:3000" : environmentOrigin(env))).replace(/\/+$/, "");
if (!/^https?:\/\/[^/\s]+$/.test(origin)) {
  console.error(`auth0:bootstrap: ${origin} is not an origin (scheme://host, no path)`);
  process.exit(2);
}

// ── the two CLIs ─────────────────────────────────────────────────────────────
function run(cmd, args, input) {
  // AUTH0_CLI / ORUN_CLI may name a .mjs stand-in (the tests'), run with node:
  // a copied tree does not always keep a script's executable bit.
  const viaNode = /\.m?js$/.test(cmd);
  const r = spawnSync(viaNode ? process.execPath : cmd, viaNode ? [cmd, ...args] : args, {
    input: input ?? "",
    encoding: "utf8",
    maxBuffer: 64 << 20,
  });
  if (r.error) {
    if (r.error.code === "ENOENT") throw new Error(`${cmd} is not installed (or not on PATH)`);
    throw r.error;
  }
  return r;
}
const changes = [];
function changed(what) {
  changes.push(what);
  console.log(`  ${dryRun ? "would" : "✓"} ${what}`);
}
function kept(what) {
  console.log(`  = ${what}`);
}

// One Management API request through the Auth0 CLI. The body goes over stdin.
// A 404 is null, so "find it" and "is it there" read the same.
function api(method, apiPath, body) {
  const write = method !== "get";
  if (write && dryRun) return body ?? {};
  const args = ["api", method, apiPath];
  const r = run(AUTH0, args, body === undefined ? "" : JSON.stringify(body));
  const out = (r.stdout || "").trim();
  if (r.status !== 0) {
    const text = `${r.stderr || ""} ${out}`;
    if (method === "get" && /\b404\b|not ?found/i.test(text)) return null;
    throw new Error(`auth0 api ${method} ${apiPath} failed: ${text.trim().slice(0, 400)}`);
  }
  if (!out) return {};
  try {
    return JSON.parse(out);
  } catch {
    throw new Error(`auth0 api ${method} ${apiPath} answered something that is not JSON`);
  }
}
function list(apiPath) {
  // Every page of a list endpoint (Auth0 pages at 50 by default, 100 at most).
  const all = [];
  for (let page = 0; page < 100; page++) {
    const sep = apiPath.includes("?") ? "&" : "?";
    const got = api("get", `${apiPath}${sep}page=${page}&per_page=100`);
    const items = Array.isArray(got) ? got : (got?.clients ?? got?.roles ?? got?.connections ?? got?.actions ?? got?.client_grants ?? []);
    all.push(...items);
    if (items.length < 100) break;
  }
  return all;
}
const union = (a = [], b = []) => [...new Set([...(a || []), ...b])];
const sameSet = (a = [], b = []) => union(a, b).length === new Set(a || []).size && union(a, b).length === new Set(b).size;

// ── the tenant ───────────────────────────────────────────────────────────────
function tenantDomain() {
  if (option("domain")) return option("domain");
  // The CLI's active tenant: `auth0 tenants list --csv` marks it with "→"
  // (CSV because of the CLI bug upstream notes; its --json is not honoured).
  const r = run(AUTH0, ["tenants", "list", "--csv"]);
  if (r.status !== 0) throw new Error(`auth0 tenants list failed — sign the CLI in first: auth0 login`);
  const line = r.stdout.split("\n").slice(1).find((l) => l.includes("→"));
  if (!line) throw new Error("the Auth0 CLI has no active tenant — sign in first: auth0 login");
  return line.split(",")[1].trim();
}

console.log(`${SITE_NAME} — Auth0 tenant bootstrap ${local ? "(local)" : `for ${env}`}${dryRun ? " (dry run)" : ""}`);
const DOMAIN = tenantDomain();
console.log(`  tenant ${DOMAIN}, origin ${origin}`);
// A tenant is a host; a local stand-in for one (the tests') is an http:// origin.
const HOST = DOMAIN.replace(/^https?:\/\//, "").replace(/\/+$/, "");
const AUDIENCE = `https://${HOST}/api/v2/`;
const CUSTOM_CLAIMS_NAMESPACE = "https://example.com";
const MANAGEMENT_CLIENT_NAME = `${SITE_NAME} Management`;
const DASHBOARD_CLIENT_NAME = `${SITE_NAME} Dashboard`;
const DEFAULT_CONNECTION_NAME = `${SITE_SLUG}-shared-database`.slice(0, 35).replace(/-+$/, "");

// tenant and prompt settings — idempotent by nature: PATCH what differs.
{
  const want = {
    customize_mfa_in_postlogin_action: true,
    flags: { enable_client_connections: false },
    friendly_name: SITE_NAME,
    picture_url: "https://cdn.auth0.com/blog/auth0_by_okta_logo_black.png",
  };
  const have = api("get", "tenants/settings") || {};
  const differs =
    have.customize_mfa_in_postlogin_action !== true ||
    have.flags?.enable_client_connections !== false ||
    have.friendly_name !== want.friendly_name ||
    have.picture_url !== want.picture_url;
  if (differs) {
    api("patch", "tenants/settings", want);
    changed("tenant settings");
  } else kept("tenant settings");

  const prompts = { identifier_first: true };
  const p = api("get", "prompts") || {};
  if (p.identifier_first !== true) {
    api("patch", "prompts", prompts);
    changed("prompt settings");
  } else kept("prompt settings");
}

// An application, by name: created when missing; this origin added to its
// lists when it is not on them.
function ensureClient(name, create, lists) {
  const existing = list("clients?fields=client_id,name,callbacks,allowed_logout_urls,web_origins,initiate_login_uri&include_fields=true").find(
    (c) => c.name === name,
  );
  if (!existing) {
    const made = api("post", "clients", create);
    changed(`application "${name}" created`);
    return made.client_id ? made : { ...made, client_id: "(dry-run)" };
  }
  const patch = {};
  for (const [field, values] of Object.entries(lists)) {
    if (field === "initiate_login_uri") {
      if (existing.initiate_login_uri !== values) patch.initiate_login_uri = values;
      continue;
    }
    const next = union(existing[field], values);
    if (next.length !== (existing[field] || []).length) patch[field] = next;
  }
  if (Object.keys(patch).length) {
    api("patch", `clients/${existing.client_id}`, patch);
    changed(`application "${name}": ${Object.keys(patch).join(", ")} for ${origin}`);
  } else kept(`application "${name}"`);
  return existing;
}
function clientSecret(client) {
  if (client.client_secret) return client.client_secret;
  if (dryRun && client.client_id === "(dry-run)") return "";
  const got = api("get", `clients/${client.client_id}?fields=client_secret&include_fields=true`);
  return got?.client_secret || "";
}

const managementClient = ensureClient(
  MANAGEMENT_CLIENT_NAME,
  {
    name: MANAGEMENT_CLIENT_NAME,
    description: `The ${SITE_NAME} client to manage tenant resources and facilitate account creation.`,
    app_type: "regular_web",
    oidc_conformant: true,
    grant_types: ["authorization_code", "refresh_token", "client_credentials"],
    callbacks: [`${origin}/onboarding/callback`],
    allowed_logout_urls: [origin],
    web_origins: [origin],
  },
  {
    callbacks: [`${origin}/onboarding/callback`],
    allowed_logout_urls: [origin],
    web_origins: [origin],
  },
);

// The management client's grant on the Management API: upstream's scopes.
{
  const scope = [
    // Users
    "read:users", "update:users", "delete:users", "create:users",
    // Connections
    "read:connections", "update:connections", "delete:connections", "create:connections",
    // Organizations
    "read:organizations_summary", "read:organizations", "update:organizations", "create:organizations",
    "delete:organizations", "create:organization_members", "read:organization_members",
    "delete:organization_members", "create:organization_connections", "read:organization_connections",
    "update:organization_connections", "delete:organization_connections", "create:organization_member_roles",
    "read:organization_member_roles", "delete:organization_member_roles", "create:organization_invitations",
    "read:organization_invitations", "delete:organization_invitations",
    // MFA Enrollment
    "read:guardian_factors", "read:authentication_methods", "delete:authentication_methods",
    "create:guardian_enrollment_tickets",
    // SCIM
    "create:scim_token", "read:scim_token", "delete:scim_token", "read:scim_config", "create:scim_config",
    "update:scim_config", "delete:scim_config",
  ];
  const grant = list(`client-grants?client_id=${encodeURIComponent(managementClient.client_id)}&audience=${encodeURIComponent(AUDIENCE)}`).find(
    (g) => g.client_id === managementClient.client_id && g.audience === AUDIENCE,
  );
  if (!grant) {
    api("post", "client-grants", { client_id: managementClient.client_id, audience: AUDIENCE, scope });
    changed("Management API grant created");
  } else if (!sameSet(union(grant.scope, scope), grant.scope)) {
    api("patch", `client-grants/${grant.id}`, { scope: union(grant.scope, scope) });
    changed("Management API grant: scopes added");
  } else kept("Management API grant");
}

const dashboardClient = ensureClient(
  DASHBOARD_CLIENT_NAME,
  {
    name: DASHBOARD_CLIENT_NAME,
    description: "The client to facilitate login to the dashboard in the context of an organization.",
    callbacks: [`${origin}/auth/callback`],
    allowed_logout_urls: [origin],
    web_origins: [origin],
    // Auth0 accepts only an https initiate-login URI.
    ...(origin.startsWith("https://") ? { initiate_login_uri: `${origin}/auth/login` } : {}),
    app_type: "regular_web",
    oidc_conformant: true,
    grant_types: ["authorization_code", "refresh_token"],
    organization_require_behavior: "post_login_prompt",
    organization_usage: "require",
    jwt_configuration: { alg: "RS256", lifetime_in_seconds: 36000, secret_encoded: false },
  },
  {
    callbacks: [`${origin}/auth/callback`],
    allowed_logout_urls: [origin],
    web_origins: [origin],
  },
);

// The shared database connection every new account starts in.
const defaultConnection = (() => {
  const found = api("get", `connections?name=${encodeURIComponent(DEFAULT_CONNECTION_NAME)}&strategy=auth0`);
  const existing = (Array.isArray(found) ? found : []).find((c) => c.name === DEFAULT_CONNECTION_NAME);
  const clients = [dashboardClient.client_id, managementClient.client_id];
  if (!existing) {
    const made = api("post", "connections", {
      strategy: "auth0",
      name: DEFAULT_CONNECTION_NAME,
      display_name: SITE_NAME,
      enabled_clients: clients,
    });
    changed(`connection "${DEFAULT_CONNECTION_NAME}" created`);
    return made;
  }
  const enabled = union(existing.enabled_clients, clients);
  if (enabled.length !== (existing.enabled_clients || []).length) {
    api("patch", `connections/${existing.id}`, { enabled_clients: enabled });
    changed(`connection "${DEFAULT_CONNECTION_NAME}": both applications enabled`);
  } else kept(`connection "${DEFAULT_CONNECTION_NAME}"`);
  return existing;
})();

// The two roles a member of an organization can hold.
function ensureRole(name, description) {
  const existing = list(`roles?name_filter=${encodeURIComponent(name)}`).find((r) => r.name === name);
  if (existing) {
    kept(`role "${name}"`);
    return existing;
  }
  const made = api("post", "roles", { name, description });
  changed(`role "${name}" created`);
  return made;
}
const adminRole = ensureRole("admin", "Manage the organization's configuration.");
const memberRole = ensureRole("member", "Member of an organization.");

// The three post-login Actions, upstream's code. An Action's secrets cannot
// be read back, so one is updated and redeployed when its code, its
// dependencies or the NAMES of its secrets differ — or with --refresh-actions.
const managementSecret = clientSecret(managementClient);
function ensureAction(name, file, secrets, dependencies = []) {
  const code = readFileSync(path.join(here, "actions", file), "utf8");
  const existing = list(`actions/actions?actionName=${encodeURIComponent(name)}`).find((a) => a.name === name);
  const body = {
    name,
    code,
    supported_triggers: [{ id: "post-login", version: "v3" }],
    dependencies,
    secrets: Object.entries(secrets).map(([n, value]) => ({ name: n, value })),
  };
  let id = existing?.id;
  if (!existing) {
    const made = api("post", "actions/actions", body);
    id = made.id;
    changed(`Action "${name}" created`);
  } else {
    const sameCode = existing.code === code;
    const sameDeps = JSON.stringify((existing.dependencies || []).map((d) => `${d.name}@${d.version}`).sort()) ===
      JSON.stringify(dependencies.map((d) => `${d.name}@${d.version}`).sort());
    const sameSecretNames = sameSet((existing.secrets || []).map((s) => s.name), Object.keys(secrets));
    if (sameCode && sameDeps && sameSecretNames && !refreshActions && existing.all_changes_deployed !== false) {
      kept(`Action "${name}"`);
      return existing;
    }
    api("patch", `actions/actions/${id}`, body);
    changed(`Action "${name}" updated`);
  }
  if (dryRun) return { name, id };
  // An Action deploys only once it has built.
  for (let i = 0; i < 80; i++) {
    const a = api("get", `actions/actions/${id}`);
    if (a?.status === "built") break;
    if (a?.status === "failed") throw new Error(`Action "${name}" failed to build`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
  }
  api("post", `actions/actions/${id}/deploy`);
  changed(`Action "${name}" deployed`);
  return { name, id };
}
const securityPolicies = ensureAction("Security Policies", "security-policies.js", {
  DASHBOARD_CLIENT_ID: dashboardClient.client_id,
});
const addDefaultRole = ensureAction(
  "Add Default Role",
  "add-default-role.js",
  {
    DOMAIN,
    CLIENT_ID: managementClient.client_id,
    CLIENT_SECRET: managementSecret,
    MEMBER_ROLE_ID: memberRole.id,
  },
  [{ name: "auth0", version: "4.4.0" }],
);
const addRoleToTokens = ensureAction("Add Role to Tokens", "add-role-to-tokens.js", {
  CUSTOM_CLAIMS_NAMESPACE,
});

// The post-login flow: upstream's three Actions, in upstream's order.
{
  const order = [addDefaultRole.name, addRoleToTokens.name, securityPolicies.name];
  const have = api("get", "actions/triggers/post-login/bindings") || {};
  const bound = (have.bindings || []).map((b) => b.display_name || b.action?.name);
  if (JSON.stringify(bound) !== JSON.stringify(order)) {
    api("patch", "actions/triggers/post-login/bindings", {
      bindings: order.map((n) => ({ ref: { type: "action_name", value: n }, display_name: n })),
    });
    changed("post-login flow bound");
  } else kept("post-login flow");
}

// The Universal Login theme (upstream's themes/universal-login.json).
{
  const theme = JSON.parse(readFileSync(path.join(here, "themes/universal-login.json"), "utf8"));
  const have = api("get", "branding/themes/default");
  if (!have) {
    api("post", "branding/themes", theme);
    changed("Universal Login theme created");
  } else {
    const { themeId, ...rest } = have;
    const differs = Object.keys(theme).some((k) => JSON.stringify(theme[k]) !== JSON.stringify(rest[k]));
    if (differs) {
      api("patch", `branding/themes/${themeId}`, theme);
      changed("Universal Login theme updated");
    } else kept("Universal Login theme");
  }
}

// The verification e-mail, which sends a new account on to create its
// organization.
{
  const want = {
    template: "verify_email",
    syntax: "liquid",
    body: readFileSync(path.join(here, "templates/verify-email.html"), "utf8"),
    from: "",
    subject: "",
    resultUrl: "{{ application.callback_domain }}/onboarding/create",
    urlLifetimeInSeconds: 432000,
    enabled: true,
  };
  const have = api("get", "email-templates/verify_email");
  if (!have) {
    api("post", "email-templates", want);
    changed("verification e-mail created");
  } else {
    const differs = ["body", "syntax", "resultUrl", "urlLifetimeInSeconds", "enabled"].some((k) => have[k] !== want[k]);
    if (differs) {
      const { template, ...patch } = want;
      api("patch", "email-templates/verify_email", patch);
      changed("verification e-mail updated");
    } else kept("verification e-mail");
  }
}

// MFA: the roaming WebAuthn and one-time-password factors.
{
  const factors = api("get", "guardian/factors") || [];
  for (const name of ["webauthn-roaming", "otp"]) {
    if ((Array.isArray(factors) ? factors : []).find((f) => f.name === name)?.enabled) {
      kept(`MFA factor ${name}`);
      continue;
    }
    api("put", `guardian/factors/${name}`, { enabled: true });
    changed(`MFA factor ${name} enabled`);
  }
}

// ── the configuration the deploy reads ───────────────────────────────────────
const config = {
  AUTH0_DOMAIN: DOMAIN,
  AUTH0_CLIENT_ID: dashboardClient.client_id,
  AUTH0_CLIENT_SECRET: clientSecret(dashboardClient),
  AUTH0_MANAGEMENT_CLIENT_ID: managementClient.client_id,
  AUTH0_MANAGEMENT_CLIENT_SECRET: managementSecret,
  AUTH0_ADMIN_ROLE_ID: adminRole.id,
  AUTH0_MEMBER_ROLE_ID: memberRole.id,
  DEFAULT_CONNECTION_ID: defaultConnection.id,
  CUSTOM_CLAIMS_NAMESPACE,
};

// A value's fingerprint: an HMAC of it keyed by its name, truncated — enough
// to tell "the same value" from "a different one", never enough to recover it.
const fingerprint = (name, value) => createHmac("sha256", name).update(value).digest("hex").slice(0, 16);
const FINGERPRINT_LABEL = "auth0-bootstrap";

if (local) {
  const file = path.join(root, "apps/web/.env.local");
  const old = existsSync(file) ? readFileSync(file, "utf8") : "";
  const session = old.match(/^SESSION_ENCRYPTION_SECRET=(\S+)$/m)?.[1] || randomBytes(32).toString("hex");
  const text =
    `# Written by pnpm auth0:bootstrap --local. Never commit this file.\n` +
    `APP_BASE_URL=${origin}\n` +
    Object.entries({ ...config, SESSION_ENCRYPTION_SECRET: session })
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") +
    "\n";
  if (text === old) kept("apps/web/.env.local");
  else if (!dryRun) {
    writeFileSync(file, text, { mode: 0o600 });
    changed("apps/web/.env.local written");
  } else changed("apps/web/.env.local");
} else {
  const listed = run(ORUN, ["secrets", "list", "--env", env, "--json"]);
  if (listed.status !== 0) {
    throw new Error(`orun secrets list --env ${env} failed — sign the orun CLI in and run this from the repository: ${(listed.stderr || "").trim().slice(0, 300)}`);
  }
  const raw = JSON.parse(listed.stdout || "[]");
  const items = Array.isArray(raw) ? raw : (raw.items ?? raw.secrets ?? raw.data ?? []);
  const have = new Map(items.map((s) => [s.secretKey ?? s.key ?? s.name, s]));
  const put = (name, value, why) => {
    if (!dryRun) {
      const r = run(ORUN, ["secrets", "set", name, "--env", env, "--display-name", `${FINGERPRINT_LABEL} ${fingerprint(name, value)}`], value);
      if (r.status !== 0) throw new Error(`orun secrets set ${name} --env ${env} failed: ${(r.stderr || "").trim().slice(0, 300)}`);
    }
    changed(`Orun secret ${name} (${env}) ${why}`);
  };
  for (const [name, value] of Object.entries(config)) {
    if (!value) throw new Error(`no value for ${name} — the tenant did not return one`);
    const meta = have.get(name);
    const mark = `${FINGERPRINT_LABEL} ${fingerprint(name, value)}`;
    if (meta && (meta.displayName || "") === mark) kept(`Orun secret ${name} (${env})`);
    else put(name, value, meta ? "updated" : "set");
  }
  // Generated once, kept for good: replacing it signs everyone out.
  if (have.has("SESSION_ENCRYPTION_SECRET")) kept(`Orun secret SESSION_ENCRYPTION_SECRET (${env})`);
  else put("SESSION_ENCRYPTION_SECRET", randomBytes(32).toString("hex"), "generated");
}

console.log(
  changes.length === 0
    ? "Nothing to change: the tenant and the configuration are as this environment needs them."
    : dryRun
      ? `${changes.length} change(s) to make; run again without --dry-run.`
      : local
        ? `Done. Start the site: pnpm --filter @app/web dev`
        : `Done. Redeploy the web component in ${env} (Orunbase's Deploy button, or gh workflow run ci.yml --ref main -f environment=${env} -f component=web) and sign-up opens.`,
);
