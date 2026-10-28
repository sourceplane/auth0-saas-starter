#!/usr/bin/env bash
# TIER 2 — the site a bootstrap produces builds, deploys (dry) and serves.
#
# placement.test.sh proves the tree a bootstrap ends with is the right tree.
# This proves it WORKS, by doing to it what its own pipelines will:
#
#   1. at the finished site, the landing's own checks — install with the
#      lockfile the site ships, render fixtures, typecheck, lint, test,
#      build. The bootstrap's own landings are checked in the box with
#      `orun validate` and `orun plan` alone (`checks: local`; their PR's CI
#      on an `orun/BASE-…` branch is `plan` alone, and the convergence on
#      main builds, deploys and smoke-tests the site), so THIS is where a
#      site those steps refuse is caught: before the tag, not after a build
#      has merged it. Every later pull request of the site runs ci.yml's
#      verify lanes;
#   2. the stage lane's own steps, rendered by `orun plan` in the site: on a
#      pull request (the verify profile) `build-app` — the component's
#      buildCommand, origin and all, the same step the deploy profile runs —
#      `verify-build-output` and `deploy-dry-run` (`wrangler deploy --dry-run
#      --name <reponame>-web-stage`). They run IN THE TREE THE RUNNER STAGES
#      for the job (testing/lib/stage-job.py), with the dependency layout the
#      pinned composition produces: if its install step is `scope: lane`, the
#      top-level node_modules is a symlink to the source checkout's; if not,
#      the job's own install step runs inside the staged tree. Run in a plain
#      checkout, this tier was green while the first live bootstrap's lanes
#      died in the lane layout (Turbopack: "Symlink … points out of the
#      filesystem root");
#   3. serve the built Worker with `wrangler dev` and run the component's OWN
#      `smokeCommand` against it, verbatim — the check the real deploy ends
#      with — and then read every route the site promises. A fresh site has
#      no Auth0 tenant, so this is the site as it is born: the home page says
#      how to connect Auth0 where the sign-up form would be, the title
#      carries the site's name, the page links the site's repository,
#      /dashboard, /onboarding and /auth send the visitor home, /api/health
#      is ok and not connected;
#   4. the SITE'S OWN tenant bootstrap (`pnpm auth0:bootstrap --env stage`,
#      tooling/auth0/bootstrap.mjs in the placed tree) against a stand-in
#      tenant and a stand-in Orun secret store (tests/web/src/fakes — never a
#      real tenant), twice: the second run must change nothing. Then the same
#      stage lane's build-app with exactly the secrets the bootstrap stored in
#      its environment, as the optional secret refs put them there, and the
#      result checked: no credential in any file of the build, the tenant's
#      configuration handed to the Worker only from a lane that can deploy.
#      Served with the configuration as the deploy hands it over (wrangler's
#      .dev.vars), it is the template itself: the sign-up form, /dashboard
#      sending the visitor to Auth0's login, and a whole sign-in — /auth/login
#      to the stand-in's /authorize (PKCE), the callback's code exchanged for
#      a signed id_token, a session, the signed-in home page, a logout —
#      through the Auth0 SDK on the Worker. Served WITHOUT the secrets, the
#      deploy's smoke must fail: a Worker that lost them is caught by the
#      deploy, not by a visitor.
#
# What it cannot do is the platform's half: create the repository, mint the
# brokered Cloudflare token, deploy for real and probe workers.dev. That is a
# bootstrap against a workspace (BOOTSTRAP.md); everything short of it is here.
#
# Needs: orun, node, pnpm, python3 (+PyYAML), git, curl, and the network for
# `pnpm install` (or a warm store). A few minutes: two installs and three
# builds (the landing's checks over the site, and the stage lane's own in its
# staged tree, without Auth0 and with it).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
# shellcheck source=lib/bootstrap.sh
source "$here/lib/bootstrap.sh"

for bin in orun node pnpm python3 git curl; do
  command -v "$bin" >/dev/null || { echo "e2e.test.sh needs $bin on PATH" >&2; exit 1; }
done

scratch="$(mktemp -d)"
dev_pid=""
# wrangler dev runs under pnpm, node and two workerd processes; a TERM to the
# first does not reach the rest, and waiting on it then never returns. So it is
# started as its own process group (setsid) and the whole group is stopped.
cleanup() {
  if [ -n "$dev_pid" ]; then
    kill -TERM -- "-$dev_pid" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 -- "-$dev_pid" 2>/dev/null || break; sleep 0.5; done
    kill -KILL -- "-$dev_pid" 2>/dev/null || true
  fi
  rm -rf "$scratch"
}
trap cleanup EXIT
values="$here/fixtures/acme.json"
repo="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['reponame'])" "$values")"
sub="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['subdomain'])" "$values")"
export CI=1 WRANGLER_SEND_METRICS=false NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1

# The landing's own checks, step for step, run here at once on the whole
# tree. A pull request in the site builds and dry-deploys it through ci.yml's
# lanes; the lint and the tests run here, and by hand before a push.
LANDING_CHECKS=(
  "pnpm install --frozen-lockfile"
  "pnpm run wire:fixture"
  "pnpm typecheck"
  "pnpm lint"
  "pnpm test"
  "pnpm build"
)
checks() { # DIR LOG
  local dir="$1" log="$2" cmd
  for cmd in "${LANDING_CHECKS[@]}"; do
    echo "   \$ $cmd" | tee -a "$log"
    if ! (cd "$dir" && bash -c "$cmd") >> "$log" 2>&1; then
      echo "FAIL: \`$cmd\` failed in $dir" >&2; tail -40 "$log" >&2; return 1
    fi
  done
}

echo "── the offline bootstrap (testing/lib/bootstrap.sh)"
tree="$scratch/$repo"
bootstrap_offline "$root" "$tree" "$values" "$scratch/logs" > "$scratch/bootstrap.log" 2>&1 || {
  echo "FAIL: the offline bootstrap stopped" >&2; tail -40 "$scratch/bootstrap.log" >&2; exit 1; }
echo "   2 phases placed and landed"

# ── 1. the finished site ───────────────────────────────────────────────────
echo "── the finished site: install, the fixture render, typecheck, lint, test, build"
checks "$tree" "$scratch/checks-site.log"

# ── 2. the deploy lane's steps, for stage ──────────────────────────────────
echo "── the stage lane: build-app, verify-build-output, deploy-dry-run"
# The 01-product landing over the repository's empty first commit: every file
# of the site changed, as on its pull request.
s00="$(git -C "$tree" rev-parse HEAD~2)"; s01="$(git -C "$tree" rev-parse HEAD~1)"
(cd "$tree" && orun plan --intent intent.yaml --trigger github-pull-request --changed \
   --base "$s00" --head "$s01" --env stage --output "$scratch/plan.json") > "$scratch/plan.log" 2>&1 \
  || { echo "FAIL: orun plan" >&2; tail -15 "$scratch/plan.log" >&2; exit 1; }
python3 - "$scratch/plan.json" "$scratch/steps" <<'PY'
import json, pathlib, sys
plan = json.load(open(sys.argv[1]))
out = pathlib.Path(sys.argv[2]); out.mkdir()
job = next(j for j in plan["jobs"] if j["component"] == "web" and j["environment"] == "stage")
for s in job["steps"]:
    if s["id"] in ("build-app", "verify-build-output", "deploy-dry-run"):
        (out / f"{s['id']}.sh").write_text(s.get("run") or "")
    if s["id"] == "install-workspace-dependencies":
        (out / "install.sh").write_text(s.get("run") or "")
        (out / "install.wd").write_text(s.get("working-directory") or ".")
        (out / "install.scope").write_text(s.get("scope") or "job")
(out / "path").write_text(job.get("path") or "apps/web")
for k, v in (job.get("env") or {}).items():
    (out / "env").open("a").write(f"export {k}={json.dumps(v)}\n")
PY
# The job's private tree, staged as orun stages it. The source checkout
# carries no build output (a CI checkout has none, so the plain-tree build's is
# removed rather than copied in), and its dependencies are what the pinned
# composition says: a lane-scoped install ran once in the source tree (step 1
# ran the same command) and is linked in, or the job installs its own.
rm -rf "$tree/apps/web/.open-next" "$tree/apps/web/.wrangler"
work="$tree/.orun/runs/e2e/web.stage.verify-deploy/work"
[ -f "$scratch/steps/install.sh" ] || { echo "FAIL: the stage lane has no install step" >&2; exit 1; }
if [ "$(cat "$scratch/steps/install.scope")" = lane ]; then
  python3 "$here/lib/stage-job.py" "$tree" "$work" --shared-deps
  [ -L "$work/node_modules" ] || { echo "FAIL: the staged tree's node_modules is not the lane's symlink" >&2; exit 1; }
  echo "   staged: $(realpath --relative-to="$tree" "$work"); install scope: lane — node_modules → the source tree's"
else
  python3 "$here/lib/stage-job.py" "$tree" "$work"
  echo "   staged: $(realpath --relative-to="$tree" "$work"); install scope: job — installing inside it"
  echo "   ▸ install-workspace-dependencies"
  (cd "$work/$(cat "$scratch/steps/path")/$(cat "$scratch/steps/install.wd")" && bash -e "$scratch/steps/install.sh") \
    > "$scratch/install.log" 2>&1 || { echo "FAIL: the lane's install step" >&2; tail -30 "$scratch/install.log" >&2; exit 1; }
  [ -d "$work/node_modules" ] && [ ! -L "$work/node_modules" ] \
    || { echo "FAIL: the job's install did not land inside its own tree" >&2; exit 1; }
fi
for step in build-app verify-build-output deploy-dry-run; do
  [ -f "$scratch/steps/$step.sh" ] || { echo "FAIL: the stage verify lane has no $step step" >&2; exit 1; }
  echo "   ▸ $step"
  # The runner's per-job environment: the job's env (intent environment
  # `env:`) and ORUN_ENVIRONMENT; the step runs in the component's directory.
  if ! (cd "$work/$(cat "$scratch/steps/path")" && \
        { [ -f "$scratch/steps/env" ] && source "$scratch/steps/env"; true; } && \
        export ORUN_ENVIRONMENT=stage && bash -e "$scratch/steps/$step.sh") > "$scratch/$step.log" 2>&1; then
    echo "FAIL: the deploy lane's $step step" >&2; tail -40 "$scratch/$step.log" >&2; exit 1
  fi
done

# ── 3. serve it, and smoke it as the deploy does ───────────────────────────
# serve DIR LOG [DEV_VARS] — wrangler dev over the built Worker in DIR, on
# $port (a free one when unset); sets $url. DEV_VARS, when given, is the
# Worker's secrets file.
free_port() { python3 -c "import socket;s=socket.socket();s.bind(('127.0.0.1',0));print(s.getsockname()[1]);s.close()"; }
serve() {
  local dir="$1" log="$2" vars="${3:-}"
  stop_dev
  [ -n "${port:-}" ] || port="$(free_port)"
  rm -f "$dir/.dev.vars"
  [ -n "$vars" ] && cp "$vars" "$dir/.dev.vars"
  (cd "$dir" && exec setsid pnpm exec wrangler dev --config wrangler.jsonc --ip 127.0.0.1 --port "$port" \
     --name "$repo-web-stage" --show-interactive-dev-session=false) > "$log" 2>&1 < /dev/null &
  dev_pid=$!
  # By name, not by address: wrangler dev hands the Worker `localhost` as the
  # request's host whichever address it was reached on, and the session
  # cookie and Auth0's callback are set for the origin the visitor used.
  url="http://localhost:$port"
  for _ in $(seq 1 90); do
    curl -s -o /dev/null "$url/" && return 0
    kill -0 "$dev_pid" 2>/dev/null || { echo "FAIL: wrangler dev exited" >&2; tail -30 "$log" >&2; exit 1; }
    sleep 1
  done
  curl -s -o /dev/null "$url/" || { echo "FAIL: wrangler dev never answered" >&2; tail -30 "$log" >&2; exit 1; }
}
stop_dev() {
  if [ -n "$dev_pid" ]; then
    kill -TERM -- "-$dev_pid" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 -- "-$dev_pid" 2>/dev/null || break; sleep 0.5; done
    kill -KILL -- "-$dev_pid" 2>/dev/null || true
    dev_pid=""
  fi
}
smoke="$(python3 -c "import yaml,sys;print(yaml.safe_load(open(sys.argv[1]))['spec']['parameters']['smokeCommand'])" "$tree/apps/web/component.yaml")"
app="$work/$(cat "$scratch/steps/path")"

echo "── wrangler dev over the built Worker: the site as it is born, Auth0 not connected"
serve "$app" "$scratch/dev.log"
echo "   ▸ the component's own smokeCommand, DEPLOYED_URL=$url"
DEPLOYED_URL="$url" bash -c "$smoke" || { echo "FAIL: the deploy's smoke refused the site" >&2; exit 1; }

echo "   ▸ every route the site promises"
routes() { # MODE (not-connected|connected) [TENANT CLIENT_ID]
python3 - "$url" "$values" "$1" "${2:-}" "${3:-}" <<'PY'
import html, http.cookiejar, json, re, sys, urllib.error, urllib.parse, urllib.request
base, values, mode, tenant, client_id = sys.argv[1], json.load(open(sys.argv[2])), sys.argv[3], sys.argv[4], sys.argv[5]
name, repo, org = values["productname"], values["reponame"], values["githuborg"]
problems = []
def bad(m): problems.append(m)
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(NoRedirect, urllib.request.HTTPCookieProcessor(jar))
def get(u):
    u = u if u.startswith("http") else base + u
    try:
        with opener.open(u, timeout=30) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read().decode(errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read().decode(errors="replace")
# The page's text as a reader sees it: React's <!-- --> separators gone,
# entities decoded (the fixture's name carries an apostrophe and an ampersand).
def text(page): return html.unescape(re.sub(r"<!-- -->", "", page))

status, headers, page = get("/")
if status != 200 or "</html>" not in page:
    bad(f"/ answered {status}, or did not render to its end")
title = re.search(r"<title>(.*?)</title>", page, re.S)
if not title or html.unescape(title.group(1)) != name:
    bad(f"the home page's <title> is {title and title.group(1)!r}, not {name!r}")
if f'href="https://github.com/{org}/{repo}"' not in page:
    bad(f"the home page does not link the site's repository github.com/{org}/{repo}")
if "SaaStart" in page or "auth0-saas-starter" in page:
    bad("the home page still carries the baseline's name")
if "heapanalytics" in page or "heap.load" in page:
    bad("the home page still loads the template's Heap analytics")

status, _, body = get("/api/health")
try:
    health = json.loads(body)
except ValueError:
    health = None
if status != 200 or health != {"ok": True, "auth0": mode}:
    bad(f"/api/health answered {status} {body[:120]!r}, want 200 ok and auth0 {mode!r}")
s, _, _ = get("/no-such-page")
if s != 404:
    bad(f"/no-such-page answered {s}, want 404")
s, _, body = get("/privacy")
if s != 200:
    bad(f"/privacy answered {s}")

if mode == "not-connected":
    if 'data-auth0="not-connected"' not in page or "Connect Auth0 to sign people up" not in page:
        bad("the home page does not say Auth0 is not connected where sign-up would be")
    if "pnpm auth0:bootstrap --env" not in text(page):
        bad("the home page does not say how to connect Auth0")
    for path in ("/dashboard", "/dashboard/organization/members", "/onboarding/create", "/onboarding/signup", "/auth/login"):
        s, h, _ = get(path)
        if s not in (302, 307) or urllib.parse.urlsplit(h.get("location", "")).path != "/":
            bad(f"{path} answered {s} {h.get('location')!r}, want a redirect home")
else:
    t = text(page)
    if 'data-auth0="not-connected"' in page or f"Try {name} for Free" not in t or "Already joined?" not in t:
        bad("the connected home page does not offer the template's sign-up form and log-in link")
    s, h, _ = get("/dashboard")
    if s not in (302, 307) or not h.get("location", "").endswith("/auth/login"):
        bad(f"/dashboard answered {s} {h.get('location')!r} to a signed-out visitor — want Auth0's login")
    s, h, _ = get("/onboarding/create")
    if s not in (302, 307) or "/onboarding/signup" not in h.get("location", ""):
        bad(f"/onboarding/create answered {s} {h.get('location')!r} — want the sign-up")
    # A whole sign-in, through the Auth0 SDK on the Worker, against the
    # stand-in tenant the bootstrap set up.
    s, h, _ = get("/auth/login?returnTo=/")
    auth = h.get("location", "")
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(auth).query)
    if s not in (302, 307) or not auth.startswith(f"{tenant}/authorize"):
        bad(f"/auth/login answered {s} {auth[:100]!r}, not the tenant's /authorize")
    elif q.get("client_id") != [client_id] or q.get("redirect_uri") != [f"{base}/auth/callback"] or q.get("code_challenge_method") != ["S256"]:
        bad(f"/auth/login asked the tenant for the wrong client or callback: {auth[:200]}")
    else:
        s, h, _ = get(auth)
        back = h.get("location", "")
        if s != 302 or not back.startswith(f"{base}/auth/callback?code="):
            bad(f"the tenant's /authorize did not send the visitor back: {s} {back[:120]!r}")
        else:
            s, h, body = get(back)
            if s not in (302, 307) or urllib.parse.urlsplit(h.get("location", "")).path != "/":
                bad(f"the callback answered {s} {h.get('location')!r} {body[:160]!r} — the code was not exchanged")
            s, _, page = get("/")
            if f"You are currently logged in to {name}." not in text(page) or "/auth/logout" not in page:
                bad("signed in, the home page does not welcome the visitor back with a logout")
            s, h, _ = get("/auth/logout")
            if s not in (302, 307) or not h.get("location", "").startswith(tenant):
                bad(f"/auth/logout answered {s} {h.get('location')!r} — want the tenant's logout")

if problems:
    for p in problems:
        print(f"  ✕ {p}", file=sys.stderr)
    sys.exit(1)
print(f"   /, /api/health, /privacy, a 404 and the Auth0 routes — the site's own, Auth0 {mode}" + (", a whole sign-in and logout" if mode == "connected" else ""))
PY
}
routes not-connected

# ── 4. the site's own tenant bootstrap, then the same lane with its secrets ─
# A stand-in tenant (OIDC and the Management API's slice the bootstrap uses)
# and a stand-in Orun secret store, from the site's own tests — never a real
# tenant or workspace. The origin is the one wrangler dev will serve on, so
# the tenant's callback lists name it, as a deployed environment's name its
# workers.dev URL.
echo "── the site's tenant bootstrap, against a stand-in tenant (twice: the second run changes nothing)"
fakes="$tree/tests/web/src/fakes"
(exec node "$fakes/auth0-tenant.mjs" --ready "$scratch/tenant.url") > "$scratch/tenant.log" 2>&1 &
tenant_pid=$!
trap 'kill "$tenant_pid" 2>/dev/null || true; cleanup' EXIT
for _ in $(seq 1 50); do [ -s "$scratch/tenant.url" ] && break; sleep 0.2; done
tenant="$(cat "$scratch/tenant.url")"
port="$(free_port)"
export FAKE_AUTH0_URL="$tenant" FAKE_ORUN_STATE="$scratch/orun-secrets.json" \
       AUTH0_CLI="$fakes/auth0-cli.mjs" ORUN_CLI="$fakes/orun-cli.mjs"
(cd "$tree" && pnpm auth0:bootstrap --env stage --origin "http://localhost:$port") > "$scratch/auth0-bootstrap.log" 2>&1 \
  || { echo "FAIL: the site's tenant bootstrap" >&2; tail -20 "$scratch/auth0-bootstrap.log" >&2; exit 1; }
writes="$(curl -sf "$tenant/__writes" | python3 -c "import json,sys;print(len(json.load(sys.stdin)))")"
(cd "$tree" && pnpm auth0:bootstrap --env stage --origin "http://localhost:$port") > "$scratch/auth0-bootstrap-2.log" 2>&1 \
  || { echo "FAIL: the tenant bootstrap's second run" >&2; tail -20 "$scratch/auth0-bootstrap-2.log" >&2; exit 1; }
[ "$(curl -sf "$tenant/__writes" | python3 -c "import json,sys;print(len(json.load(sys.stdin)))")" = "$writes" ] \
  && grep -q "Nothing to change" "$scratch/auth0-bootstrap-2.log" \
  || { echo "FAIL: the tenant bootstrap's second run changed the tenant" >&2; tail -20 "$scratch/auth0-bootstrap-2.log" >&2; exit 1; }
grep -q "^  ✓ application \"$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['productname'])" "$values") Dashboard\" created" "$scratch/auth0-bootstrap.log" \
  || { echo "FAIL: the bootstrap did not name the tenant's applications after the site" >&2; head -12 "$scratch/auth0-bootstrap.log" >&2; exit 1; }
echo "   $writes writes to the tenant, then none; the configuration stored as the stage environment's secrets"
# The secrets as the job resolves them: KEY=value lines for the build's
# environment, and the dashboard application's id the sign-in must use.
python3 - "$scratch/orun-secrets.json" "$scratch/auth0.env" <<'PY'
import json, shlex, sys
s = json.load(open(sys.argv[1]))["stage"]
open(sys.argv[2], "w").write("".join(f"export {k}={shlex.quote(v['value'])}\n" for k, v in s.items()))
PY
client_id="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['stage']['AUTH0_CLIENT_ID']['value'])" "$scratch/orun-secrets.json")"
secret_values=()
for k in AUTH0_CLIENT_SECRET AUTH0_MANAGEMENT_CLIENT_SECRET SESSION_ENCRYPTION_SECRET; do
  secret_values+=("$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['stage'][sys.argv[2]]['value'])" "$scratch/orun-secrets.json" "$k")")
done

echo "── the stage lane's build-app again, with the stored secrets as the optional refs supply them"
rm -rf "$app/.open-next" "$app/.next" "$app/.wrangler"
if ! (cd "$app" && { [ -f "$scratch/steps/env" ] && source "$scratch/steps/env"; true; } && \
      source "$scratch/auth0.env" && export ORUN_ENVIRONMENT=stage && \
      unset CLOUDFLARE_API_TOKEN && bash -e "$scratch/steps/build-app.sh") > "$scratch/build-app-auth0.log" 2>&1; then
  echo "FAIL: the deploy lane's build-app step, with the tenant's configuration" >&2; tail -40 "$scratch/build-app-auth0.log" >&2; exit 1
fi
grep -q "worker-secrets: no Cloudflare credential in this job (a verify lane) — .*AUTH0_CLIENT_SECRET.* reach $repo-web-stage from the deploy lane" \
  "$scratch/build-app-auth0.log" || { echo "FAIL: the build did not hand the tenant's configuration to $repo-web-stage (or claimed to from a verify lane)" >&2; tail -10 "$scratch/build-app-auth0.log" >&2; exit 1; }
for v in "${secret_values[@]}"; do
  if grep -rlF -- "$v" "$app/.open-next" "$app/.next" "$scratch/build-app-auth0.log" > "$scratch/leaks.txt" 2>/dev/null; then
    echo "FAIL: a credential of the tenant's is in the build:" >&2; head -5 "$scratch/leaks.txt" >&2; exit 1
  fi
done
echo "   no credential in any file of the build; the configuration pushed only by a deploy lane"
(cd "$app" && { [ -f "$scratch/steps/env" ] && source "$scratch/steps/env"; true; } && \
   export ORUN_ENVIRONMENT=stage && bash -e "$scratch/steps/verify-build-output.sh") > "$scratch/verify-auth0.log" 2>&1 \
  || { echo "FAIL: verify-build-output, with Auth0" >&2; tail -20 "$scratch/verify-auth0.log" >&2; exit 1; }

echo "── wrangler dev over it, with the secrets the deploy hands the Worker"
# The Worker secrets the deploy pushes (worker-secrets.mjs --dev-vars writes
# the same set for wrangler dev), plus APP_BASE_URL: the build's origin is the
# environment's workers.dev URL, and here the Worker answers on localhost.
(source "$scratch/auth0.env" && node "$tree/tooling/wire/worker-secrets.mjs" --dev-vars "$scratch/auth0.dev.vars" \
   $(python3 -c "import json,sys;print(' '.join('--secret '+k for k in json.load(open(sys.argv[1]))['stage']))" "$scratch/orun-secrets.json")) > /dev/null
echo "APP_BASE_URL=http://localhost:$port" >> "$scratch/auth0.dev.vars"
serve "$app" "$scratch/dev-auth0.log" "$scratch/auth0.dev.vars"
echo "   ▸ the component's own smokeCommand, DEPLOYED_URL=$url"
DEPLOYED_URL="$url" bash -c "$smoke" || { echo "FAIL: the deploy's smoke refused the site with Auth0 connected" >&2; exit 1; }
echo "   ▸ every route the site promises, and a whole sign-in"
routes connected "$tenant" "$client_id"

echo "── and without them: the deploy's smoke must refuse a Worker that lost its secrets"
port="$(free_port)"
serve "$app" "$scratch/dev-nosecret.log"
if DEPLOYED_URL="$url" bash -c "$smoke" 2>/dev/null; then
  echo "FAIL: the smoke passed a connected site whose Worker has none of the tenant's configuration" >&2; exit 1
fi
echo "   refused"
stop_dev

echo "e2e.test.sh: ok"
