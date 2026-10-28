import { SITE_NAME } from "@/app/site"
import { AUTH0_SIGNUP_URL } from "@/lib/auth0-connection"

// Where the sign-up form goes until an Auth0 tenant is connected: what the
// owner does to connect one (README → Connect Auth0). Server-rendered; names
// the commands and secrets, never a value.
export function ConnectAuth0() {
  return (
    <div
      data-auth0="not-connected"
      className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[420px]"
    >
      <div className="flex flex-col space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Connect Auth0 to sign people up
        </h1>
        <p className="text-sm text-muted-foreground">
          {SITE_NAME} keeps its organizations, members, roles, SSO connections
          and security policies in an Auth0 tenant, and none is connected to
          this environment yet.
        </p>
      </div>
      <ol className="list-decimal space-y-3 pl-5 text-sm text-muted-foreground">
        <li>
          Create a tenant at{" "}
          <a className="underline" href={AUTH0_SIGNUP_URL}>
            auth0.com
          </a>{" "}
          and sign the Auth0 CLI in to it: <code>auth0 login</code>.
        </li>
        <li>
          From the repository, set the tenant up for this environment:{" "}
          <code>pnpm auth0:bootstrap --env &lt;environment&gt;</code>. It
          creates the applications, roles, connection and Actions, and stores
          their configuration as this environment&apos;s Orun secrets.
        </li>
        <li>
          Redeploy the web component. The deploy hands the secrets to the
          Worker, and sign-up opens here.
        </li>
      </ol>
    </div>
  )
}
