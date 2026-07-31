import type {
  ArticlePlacement,
  CanonicalArticle,
  CanonicalCollection,
  CollectionPlacement,
  EffectiveArticle,
  EffectiveCollection,
} from './types'

/** Null, empty, and whitespace-only override values all mean "inherit". */
function override(value: string | null | undefined): string | null {
  if (value == null) return null
  return value.trim() === '' ? null : value
}

export function mergeArticle(
  canonical: CanonicalArticle,
  placement: ArticlePlacement | null,
): EffectiveArticle {
  const title = override(placement?.titleOverride)
  const bodyHtml = override(placement?.bodyHtmlOverride)
  const collectionId = placement?.collectionOverrideId ?? null

  // Body json and html are a pair. Html is what renders, so an override only
  // counts when html is present; json follows it when supplied.
  const bodyJson = bodyHtml !== null ? (placement?.bodyJsonOverride ?? canonical.bodyJson) : canonical.bodyJson

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

export function mergeCollection(
  canonical: CanonicalCollection,
  placement: CollectionPlacement | null,
): EffectiveCollection {
  const title = override(placement?.titleOverride)
  const description = override(placement?.descriptionOverride)

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
    isOverridden: title !== null || description !== null,
  }
}
