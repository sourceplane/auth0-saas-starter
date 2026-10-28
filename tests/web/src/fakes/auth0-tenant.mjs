#!/usr/bin/env node
// A stand-in Auth0 tenant for the tests — never a real one. Zero-dependency.
//
//   - an OIDC provider: discovery, /authorize (which signs the visitor straight
//     in and sends them back with a code), /oauth/token (an RS256 id_token,
//     PKCE checked), the JWKS, /userinfo and /v2/logout;
//   - the slice of the Management API (/api/v2/…) the tenant bootstrap uses
//     (tooling/auth0/bootstrap.mjs), with its objects kept in memory, and a
//     count of every write, so a test can tell a run that changed nothing.
//
//   node auth0-tenant.mjs [--port N] [--ready <file>]
//     prints (and writes to --ready) the origin it listens on, then serves
//     until killed; GET /__writes answers the writes so far as JSON.
//
//   import { startTenant } from "./auth0-tenant.mjs"   (the vitest suites)
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { realpathSync, writeFileSync } from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const id = (prefix) => `${prefix}${randomBytes(8).toString("hex")}`;

export function startTenant({ port = 0 } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "fake-1", alg: "RS256", use: "sig" };
  const state = {
    settings: {},
    prompts: {},
    clients: [],
    grants: [],
    connections: [],
    roles: [],
    actions: [],
    bindings: [],
    theme: null,
    email: null,
    factors: [
      { name: "webauthn-roaming", enabled: false },
      { name: "otp", enabled: false },
      { name: "sms", enabled: false },
    ],
  };
  const writes = [];
  const codes = new Map();
  let origin = "";

  function idToken(clientId, nonce) {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: jwk.kid }));
    const payload = b64url(
      JSON.stringify({
        iss: `${origin}/`,
        aud: clientId,
        sub: "auth0|e2e-user",
        email: "ada@example.invalid",
        email_verified: true,
        name: "Ada Lovelace",
        nonce,
        sid: "fake-session",
        iat: now,
        exp: now + 3600,
      }),
    );
    const sig = sign("sha256", Buffer.from(`${header}.${payload}`), privateKey);
    return `${header}.${payload}.${b64url(sig)}`;
  }

  function json(res, status, body) {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body === undefined ? "" : JSON.stringify(body));
  }
  const notFound = (res) => json(res, 404, { statusCode: 404, error: "Not Found", message: "not found" });

  function management(method, path, query, body, res) {
    const write = (what) => writes.push(`${method.toUpperCase()} ${what}`);
    const seg = path.split("/");
    if (path === "tenants/settings") {
      if (method === "get") return json(res, 200, state.settings);
      write(path);
      Object.assign(state.settings, body);
      return json(res, 200, state.settings);
    }
    if (path === "prompts") {
      if (method === "get") return json(res, 200, state.prompts);
      write(path);
      Object.assign(state.prompts, body);
      return json(res, 200, state.prompts);
    }
    if (seg[0] === "clients") {
      if (seg.length === 1 && method === "get") {
        const page = Number(query.get("page") || 0);
        const per = Number(query.get("per_page") || 50);
        return json(
          res,
          200,
          state.clients.slice(page * per, (page + 1) * per).map(({ client_secret, ...c }) => c),
        );
      }
      if (seg.length === 1 && method === "post") {
        write("clients");
        const c = { ...body, client_id: id("cid_"), client_secret: id("csec_") + id("") };
        state.clients.push(c);
        return json(res, 201, c);
      }
      const c = state.clients.find((x) => x.client_id === seg[1]);
      if (!c) return notFound(res);
      if (method === "get") return json(res, 200, query.get("fields") === "client_secret" ? { client_secret: c.client_secret } : c);
      write(`clients/${seg[1]}`);
      Object.assign(c, body);
      return json(res, 200, c);
    }
    if (seg[0] === "client-grants") {
      if (seg.length === 1 && method === "get") {
        return json(
          res,
          200,
          state.grants.filter(
            (g) => (!query.get("client_id") || g.client_id === query.get("client_id")) && (!query.get("audience") || g.audience === query.get("audience")),
          ),
        );
      }
      if (seg.length === 1 && method === "post") {
        write("client-grants");
        const g = { ...body, id: id("cgr_") };
        state.grants.push(g);
        return json(res, 201, g);
      }
      const g = state.grants.find((x) => x.id === seg[1]);
      if (!g) return notFound(res);
      write(`client-grants/${seg[1]}`);
      Object.assign(g, body);
      return json(res, 200, g);
    }
    if (seg[0] === "connections") {
      if (seg.length === 1 && method === "get") return json(res, 200, state.connections.filter((c) => !query.get("name") || c.name === query.get("name")));
      if (seg.length === 1 && method === "post") {
        write("connections");
        const c = { ...body, id: id("con_") };
        state.connections.push(c);
        return json(res, 201, c);
      }
      const c = state.connections.find((x) => x.id === seg[1]);
      if (!c) return notFound(res);
      write(`connections/${seg[1]}`);
      Object.assign(c, body);
      return json(res, 200, c);
    }
    if (seg[0] === "roles") {
      if (method === "get") {
        const f = query.get("name_filter");
        return json(res, 200, state.roles.filter((r) => !f || r.name.includes(f)));
      }
      write("roles");
      const r = { ...body, id: id("rol_") };
      state.roles.push(r);
      return json(res, 201, r);
    }
    if (path === "actions/triggers/post-login/bindings") {
      if (method === "get") return json(res, 200, { bindings: state.bindings });
      write(path);
      state.bindings = body.bindings.map((b) => ({ id: id("bnd_"), display_name: b.display_name, action: { name: b.ref.value } }));
      return json(res, 200, { bindings: state.bindings });
    }
    if (seg[0] === "actions" && seg[1] === "actions") {
      if (seg.length === 2 && method === "get") {
        const n = query.get("actionName");
        return json(res, 200, { actions: state.actions.filter((a) => !n || a.name === n), total: state.actions.length });
      }
      if (seg.length === 2 && method === "post") {
        write("actions/actions");
        const a = { ...body, id: id("act_"), status: "pending", all_changes_deployed: false };
        a.secrets = (body.secrets || []).map((s) => ({ name: s.name }));
        state.actions.push(a);
        return json(res, 201, a);
      }
      const a = state.actions.find((x) => x.id === seg[2]);
      if (!a) return notFound(res);
      if (seg[3] === "deploy") {
        write(`actions/actions/${a.id}/deploy`);
        a.all_changes_deployed = true;
        return json(res, 200, { id: id("ver_"), action: a });
      }
      if (method === "get") {
        if (a.status === "pending") a.status = "built";
        return json(res, 200, a);
      }
      write(`actions/actions/${a.id}`);
      Object.assign(a, body, { status: "pending", all_changes_deployed: false, secrets: (body.secrets || []).map((s) => ({ name: s.name })) });
      return json(res, 200, a);
    }
    if (seg[0] === "branding" && seg[1] === "themes") {
      if (method === "get") return state.theme ? json(res, 200, state.theme) : notFound(res);
      write(path);
      state.theme = { ...(state.theme || {}), ...body, themeId: state.theme?.themeId || id("thm_") };
      return json(res, 200, state.theme);
    }
    if (seg[0] === "email-templates") {
      if (method === "get") return state.email ? json(res, 200, state.email) : notFound(res);
      write(path);
      state.email = { ...(state.email || {}), ...body };
      return json(res, 200, state.email);
    }
    if (seg[0] === "guardian" && seg[1] === "factors") {
      if (method === "get") return json(res, 200, state.factors);
      write(path);
      const f = state.factors.find((x) => x.name === seg[2]);
      if (f) Object.assign(f, body);
      return json(res, 200, f);
    }
    return notFound(res);
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, origin);
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString();
      const p = url.pathname;
      if (p === "/__writes") return json(res, 200, writes);
      if (p === "/.well-known/openid-configuration") {
        return json(res, 200, {
          issuer: `${origin}/`,
          authorization_endpoint: `${origin}/authorize`,
          token_endpoint: `${origin}/oauth/token`,
          userinfo_endpoint: `${origin}/userinfo`,
          jwks_uri: `${origin}/.well-known/jwks.json`,
          end_session_endpoint: `${origin}/oidc/logout`,
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
        });
      }
      if (p === "/.well-known/jwks.json") return json(res, 200, { keys: [jwk] });
      if (p === "/authorize") {
        const code = id("code_");
        codes.set(code, {
          clientId: url.searchParams.get("client_id"),
          nonce: url.searchParams.get("nonce"),
          challenge: url.searchParams.get("code_challenge"),
          redirectUri: url.searchParams.get("redirect_uri"),
        });
        const back = new URL(url.searchParams.get("redirect_uri"));
        back.searchParams.set("code", code);
        back.searchParams.set("state", url.searchParams.get("state"));
        res.writeHead(302, { location: back.toString() });
        return res.end();
      }
      if (p === "/oauth/token" && req.method === "POST") {
        const form = new URLSearchParams(raw);
        let clientId = form.get("client_id");
        let secret = form.get("client_secret");
        const basic = (req.headers.authorization || "").match(/^Basic (.+)$/);
        if (basic) [clientId, secret] = Buffer.from(basic[1], "base64").toString().split(":").map(decodeURIComponent);
        const client = state.clients.find((c) => c.client_id === clientId);
        const grant = codes.get(form.get("code"));
        codes.delete(form.get("code"));
        if (!client || client.client_secret !== secret) return json(res, 401, { error: "invalid_client" });
        if (!grant || grant.clientId !== clientId || grant.redirectUri !== form.get("redirect_uri")) return json(res, 400, { error: "invalid_grant" });
        const verifier = form.get("code_verifier") || "";
        if (b64url(createHash("sha256").update(verifier).digest()) !== grant.challenge) return json(res, 400, { error: "invalid_grant", error_description: "PKCE" });
        return json(res, 200, {
          access_token: id("at_"),
          id_token: idToken(clientId, grant.nonce),
          token_type: "Bearer",
          expires_in: 3600,
          scope: "openid profile email",
        });
      }
      if (p === "/userinfo") return json(res, 200, { sub: "auth0|e2e-user", email: "ada@example.invalid", email_verified: true });
      if (p === "/oidc/logout" || p === "/v2/logout") {
        const to = url.searchParams.get("post_logout_redirect_uri") || url.searchParams.get("returnTo") || "/";
        res.writeHead(302, { location: to });
        return res.end();
      }
      if (p.startsWith("/api/v2/")) {
        let body;
        try {
          body = raw ? JSON.parse(raw) : undefined;
        } catch {
          return json(res, 400, { error: "bad json" });
        }
        return management(req.method.toLowerCase(), p.slice("/api/v2/".length).replace(/\/+$/, ""), url.searchParams, body, res);
      }
      return notFound(res);
    });
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      origin = `http://127.0.0.1:${server.address().port}`;
      resolve({ origin, state, writes, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

// Run as a script (not imported): compared by real path, since a temporary
// directory is often reached through a symlink (/tmp on macOS).
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const arg = (n) => {
    const i = process.argv.indexOf(`--${n}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const { origin } = await startTenant({ port: Number(arg("port") || 0) });
  if (arg("ready")) writeFileSync(arg("ready"), origin);
  console.log(origin);
}
