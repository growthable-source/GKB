import type { ArticlePlacement, CanonicalArticle, EffectiveArticle } from './types'

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

  return {
    ...canonical,
    title: title ?? canonical.title,
    position: placement?.position ?? 0,
    isHidden: placement?.isHidden ?? false,
    isOverridden: title !== null,
  }
}
