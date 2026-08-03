import type {
  ArticlePlacement,
  CanonicalArticle,
  CanonicalArticleSummary,
  CanonicalCollection,
  CollectionPlacement,
  EffectiveArticle,
  EffectiveArticleSummary,
  EffectiveCollection,
} from './types'

/**
 * Normalizes a placement override value. Null, empty, and whitespace-only all
 * mean "inherit", so a blank override never blanks out canonical content.
 */
function normalizeOverride(value: string | null | undefined): string | null {
  if (value == null) return null
  return value.trim() === '' ? null : value
}

export function mergeArticle(
  canonical: CanonicalArticle,
  placement: ArticlePlacement | null,
): EffectiveArticle {
  const title = normalizeOverride(placement?.titleOverride)
  const bodyHtml = normalizeOverride(placement?.bodyHtmlOverride)
  const collectionId = placement?.collectionOverrideId ?? null

  // Body json and html are a pair. Html is what renders, so an override only
  // counts when html is present; json follows it when supplied.
  const bodyJson =
    bodyHtml === null ? canonical.bodyJson : (placement?.bodyJsonOverride ?? canonical.bodyJson)

  // An override only counts toward isOverridden when it actually changes the
  // effective value — a placement field equal to the canonical value is a
  // no-op, not a local edit.
  const titleChanged = title !== null && title !== canonical.title
  const bodyChanged = bodyHtml !== null && bodyHtml !== canonical.bodyHtml
  const collectionChanged = collectionId !== null && collectionId !== canonical.collectionId

  return {
    ...canonical,
    title: title ?? canonical.title,
    bodyHtml: bodyHtml ?? canonical.bodyHtml,
    bodyJson,
    collectionId: collectionId ?? canonical.collectionId,
    position: placement?.position ?? 0,
    isHidden: placement?.isHidden ?? false,
    isOverridden: titleChanged || bodyChanged || collectionChanged,
  }
}

/**
 * The body-free half of mergeArticle, for list views. Applies the same title
 * and collection precedence; it just has no body to merge, and so no basis to
 * compute isOverridden (which counts body edits too).
 */
export function mergeArticleSummary(
  canonical: CanonicalArticleSummary,
  placement: Pick<
    ArticlePlacement,
    'position' | 'isHidden' | 'titleOverride' | 'collectionOverrideId'
  >,
): EffectiveArticleSummary {
  const title = normalizeOverride(placement.titleOverride)

  return {
    ...canonical,
    title: title ?? canonical.title,
    collectionId: placement.collectionOverrideId ?? canonical.collectionId,
    position: placement.position,
    isHidden: placement.isHidden,
  }
}

export function mergeCollection(
  canonical: CanonicalCollection,
  placement: CollectionPlacement | null,
): EffectiveCollection {
  const title = normalizeOverride(placement?.titleOverride)
  const description = normalizeOverride(placement?.descriptionOverride)

  // Same rule as mergeArticle: a placement value equal to the canonical value
  // is a no-op, not a local edit.
  const titleChanged = title !== null && title !== canonical.title
  const descriptionChanged = description !== null && description !== canonical.description

  return {
    ...canonical,
    title: title ?? canonical.title,
    description: description ?? canonical.description,
    position: placement?.position ?? 0,
    isHidden: placement?.isHidden ?? false,
    // Fail closed: without a placement row there is no record of who may see
    // this collection, so treat it as gated rather than defaulting to public
    // and risking a leak. Queries always join a real placement row; this
    // default only guards the case where one is missing.
    audience: placement?.audience ?? 'authenticated',
    isOverridden: titleChanged || descriptionChanged,
  }
}
