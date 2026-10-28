// The clients upstream builds at module load, built on first use instead: on
// Cloudflare Workers the Worker's secrets are copied into process.env when a
// request arrives, which can be after a module is evaluated, and a site with
// no Auth0 tenant connected must load these modules without constructing
// anything (lib/auth0-connection.ts). Every call site is upstream's —
// `appClient.getSession()`, `managementClient.users…` — through a proxy that
// builds the client the first time one of its members is read.
export function lazy<T extends object>(make: () => T): T {
  let instance: T | undefined
  return new Proxy({} as T, {
    get(_target, prop) {
      instance ??= make()
      const value = Reflect.get(instance, prop, instance)
      return typeof value === "function" ? value.bind(instance) : value
    },
  })
}
