/// <reference types="node" />

declare namespace NodeJS {
  export interface ProcessEnv {
    // The site's public origin (Auth0's appBaseUrl); the Orun build sets
    // NEXT_PUBLIC_SITE_URL per environment, APP_BASE_URL overrides it.
    APP_BASE_URL?: string
    NEXT_PUBLIC_SITE_URL?: string

    // Whether the build was made for a connected tenant (next.config.ts)
    AUTH0_CONNECTED?: string

    // Global Auth0 SDK configuration
    AUTH0_DOMAIN?: string // The tenant's domain (can be a custom domain)
    NEXT_PUBLIC_AUTH0_DOMAIN: string // The same, inlined by the build for the SSO forms
    AUTH0_MANAGEMENT_API_DOMAIN?: string // The domain used to make management API requests (default: AUTH0_DOMAIN)
    SESSION_ENCRYPTION_SECRET: string

    // Client ID and secret for the application within the context of an organization
    AUTH0_CLIENT_ID: string
    AUTH0_CLIENT_SECRET: string

    // Client ID and secret for the application used to allow a user to manage organizations
    AUTH0_MANAGEMENT_CLIENT_ID: string
    AUTH0_MANAGEMENT_CLIENT_SECRET: string

    // Roles assigned to the members of an organization
    AUTH0_ADMIN_ROLE_ID: string
    AUTH0_MEMBER_ROLE_ID: string

    // The default connection ID users will use to create an account with during onboarding
    DEFAULT_CONNECTION_ID: string

    // The namespace used to prefix custom claims
    CUSTOM_CLAIMS_NAMESPACE: string
  }
}
