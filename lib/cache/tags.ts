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
/** Whether a center has a live AI chat widget, and the embed to render for it. */
export const AI_WIDGET_TAG = 'brand:ai-widget'

/** Backstop only — every mutation busts its tags explicitly. */
export const CONTENT_TTL_SECONDS = 300
export const BRAND_TTL_SECONDS = 600
/**
 * Shorter than BRAND_TTL_SECONDS on purpose. Adding and removing the widget bust
 * this tag explicitly, so the TTL only covers state changed outside our app —
 * chiefly a customer cancelling in Xovera. Thirty seconds keeps the brief's
 * "widget stops loading within ~30s" true even in that case.
 */
export const AI_WIDGET_TTL_SECONDS = 30
