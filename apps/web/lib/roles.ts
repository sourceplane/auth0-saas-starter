import { User } from "@auth0/nextjs-auth0/types"

// Read when used, not at module load: on Workers the role ids and the claims
// namespace are Worker secrets, in process.env once a request has arrived.
function rolesClaimKey() {
  return `${process.env.CUSTOM_CLAIMS_NAMESPACE}/roles`
}

export const roles = {
  get member() {
    return process.env.AUTH0_MEMBER_ROLE_ID
  },
  get admin() {
    return process.env.AUTH0_ADMIN_ROLE_ID
  },
}

export type Role = keyof typeof roles

export function getRole(user: User) {
  // we only allow a single role to be assigned to a user
  const role = (user[rolesClaimKey()] as string[])?.[0]

  // if no role is assigned, set them to the default member role
  return role ?? "member"
}
