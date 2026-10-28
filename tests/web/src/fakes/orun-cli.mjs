#!/usr/bin/env node
// A stand-in for the orun CLI's secret store, for the tests: the two
// commands the tenant bootstrap runs, over a JSON file at $FAKE_ORUN_STATE
// ({ "<env>": { "<KEY>": { value, displayName, version } } }) — never the
// real workspace. Like the real one it is write-only on its CLI: `list`
// answers metadata, never a value; the tests read the file.
//
//   orun secrets list --env <env> --json
//   orun secrets set <KEY> --env <env> [--display-name <text>]   value on stdin
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const file = process.env.FAKE_ORUN_STATE;
if (!file) {
  console.error("fake orun: FAKE_ORUN_STATE is not set");
  process.exit(2);
}
const argv = process.argv.slice(2);
const opt = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const state = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
const env = opt("env");
if (argv[0] !== "secrets" || !env) {
  console.error(`fake orun: unsupported command ${argv.join(" ")}`);
  process.exit(2);
}
const scope = (state[env] ??= {});
if (argv[1] === "list") {
  console.log(JSON.stringify(Object.entries(scope).map(([secretKey, s]) => ({ secretKey, displayName: s.displayName, version: s.version }))));
  process.exit(0);
}
if (argv[1] === "set") {
  const key = argv[2];
  const value = readFileSync(0, "utf8");
  if (!/^[A-Z][A-Z0-9_]*$/.test(key) || !value) {
    console.error("fake orun: a key and a value on stdin are required");
    process.exit(2);
  }
  scope[key] = { value, displayName: opt("display-name") || "", version: (scope[key]?.version || 0) + 1 };
  writeFileSync(file, JSON.stringify(state, null, 2));
  console.log(`set ${key} (${env})`);
  process.exit(0);
}
console.error(`fake orun: unsupported command ${argv.join(" ")}`);
process.exit(2);
