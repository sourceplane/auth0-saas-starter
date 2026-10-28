# web — architecture

Built by the turbo pipeline from `apps/web` and deployed with wrangler.

|                     |                                                 |
| ------------------- | ----------------------------------------------- |
| Worker config       | `apps/web/wrangler.jsonc`                       |
| Entry               | `.open-next/worker.js`                          |
| Compatibility date  | `2026-10-01`                                    |
| Compatibility flags | `nodejs_compat`, `global_fetch_strictly_public` |

## Bindings

| Binding  | Kind          | Source              |
| -------- | ------------- | ------------------- |
| `ASSETS` | Static assets | `.open-next/assets` |

## Secrets resolved by the lane (names only)

- `AUTH0_ADMIN_ROLE_ID` (optional)
- `AUTH0_CLIENT_ID` (optional)
- `AUTH0_CLIENT_SECRET` (optional)
- `AUTH0_DOMAIN` (optional)
- `AUTH0_MANAGEMENT_API_DOMAIN` (optional)
- `AUTH0_MANAGEMENT_CLIENT_ID` (optional)
- `AUTH0_MANAGEMENT_CLIENT_SECRET` (optional)
- `AUTH0_MEMBER_ROLE_ID` (optional)
- `CUSTOM_CLAIMS_NAMESPACE` (optional)
- `DEFAULT_CONNECTION_ID` (optional)
- `SESSION_ENCRYPTION_SECRET` (optional)
