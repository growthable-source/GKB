/**
 * Cache tags for cross-request content and brand reads.
 *
 * Tags are deliberately not scoped by help center id. Content is owned by the
 * single base help center (see getBaseHelpCenterId), so there is nothing to
 * scope to; the id still travels in each cache key as a call argument, so keys
 * cannot collide even if a second base center ever existed.
 */
export const CONTENT_ARTICLES_TAG = 'content:articles'
export const CONTENT_COLLECTIONS_TAG = 'content:collections'
export const BRAND_TAG = 'brand:centers'
/** Which articles each center hides. Separate from content: the content itself
 *  is identical across centers, only the visibility filter differs. */
export const EXCLUSIONS_TAG = 'brand:exclusions'

/** Backstop only — every mutation busts its tags explicitly. */
export const CONTENT_TTL_SECONDS = 300
export const BRAND_TTL_SECONDS = 600
