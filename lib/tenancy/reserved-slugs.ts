/**
 * Slugs a help center may not take, because they collide with real routes on
 * this deployment (or with the conventional www label).
 *
 * Shared by create and update so a center cannot be renamed into a slug it
 * could never have been created with.
 */
export const RESERVED_SLUGS = new Set([
  'www', 'api', 'admin', 'a', 'search', 'login', 'auth', 'assets', 'ops',
])
