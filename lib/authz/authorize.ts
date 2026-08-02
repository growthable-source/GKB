import { userClient, serviceClient } from '@/lib/db/client'

export type Role = 'owner' | 'staff' | 'editor' | 'contributor'

/** help_center_id null means the membership is global (owner and staff only). */
export type Membership = { helpCenterId: string | null; role: Role }

export type Actor = { userId: string | null; memberships: Membership[] }

export type Action =
  | 'article.create'
  | 'article.update'
  | 'article.publish'
  | 'article.delete'
  | 'collection.create'
  | 'collection.update'
  | 'collection.delete'
  | 'helpCenter.create'
  | 'helpCenter.update'
  | 'helpCenter.delete'

type Resource = { helpCenterId?: string }

const GLOBAL_ROLES: Role[] = ['owner', 'staff']

/** Actions a role may take within its scope. */
const ALLOWED: Record<Role, Action[]> = {
  owner: [
    'article.create', 'article.update', 'article.publish', 'article.delete',
    'collection.create', 'collection.update', 'collection.delete',
    'helpCenter.create', 'helpCenter.update', 'helpCenter.delete',
  ],
  staff: [
    'article.create', 'article.update', 'article.publish', 'article.delete',
    'collection.create', 'collection.update', 'collection.delete',
    'helpCenter.create', 'helpCenter.update',
  ],
  editor: ['article.create', 'article.update', 'article.publish', 'helpCenter.update'],
  contributor: ['article.create', 'article.update'],
}

export function can(actor: Actor, action: Action, resource: Resource): boolean {
  if (!actor.userId) return false

  return actor.memberships.some((membership) => {
    if (!ALLOWED[membership.role].includes(action)) return false

    const isGlobal = membership.helpCenterId === null && GLOBAL_ROLES.includes(membership.role)
    if (isGlobal) return true

    return resource.helpCenterId !== undefined && membership.helpCenterId === resource.helpCenterId
  })
}

/** Loads the signed-in actor, or an anonymous actor when there is no session. */
export async function currentActor(): Promise<Actor> {
  const { data } = await (await userClient()).auth.getUser()
  if (!data.user) return { userId: null, memberships: [] }

  const { data: rows } = await serviceClient()
    .from('memberships')
    .select('help_center_id, role')
    .eq('user_id', data.user.id)

  return {
    userId: data.user.id,
    memberships: (rows ?? []).map((r) => ({
      helpCenterId: r.help_center_id,
      role: r.role as Role,
    })),
  }
}

export class ForbiddenError extends Error {
  constructor(action: Action) {
    super(`Not allowed to perform ${action}`)
    this.name = 'ForbiddenError'
  }
}

/** Throws unless the current actor may perform `action`. Call first in every mutation. */
export async function authorize(action: Action, resource: Resource = {}): Promise<Actor> {
  const actor = await currentActor()
  if (!can(actor, action, resource)) throw new ForbiddenError(action)
  return actor
}
