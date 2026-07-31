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

  return {
    ...canonical,
    title: title ?? canonical.title,
    bodyHtml: bodyHtml ?? canonical.bodyHtml,
    bodyJson,
    collectionId: collectionId ?? canonical.collectionId,
    position: placement?.position ?? 0,
    isHidden: placement?.isHidden ?? false,
    isOverridden: title !== null || bodyHtml !== null || collectionId !== null,
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
    audience: placement?.audience ?? 'public',
    isOverridden: title !== null || description !== null,
  }
}
