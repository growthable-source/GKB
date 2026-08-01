export type ArticleStatus = 'draft' | 'in_review' | 'published' | 'archived'
export type Audience = 'public' | 'authenticated'

/** A ProseMirror document. Opaque to everything except the editor. */
export type BodyJson = Record<string, unknown>

export type CanonicalArticle = {
  id: string
  slug: string
  title: string
  excerpt: string | null
  bodyJson: BodyJson
  bodyHtml: string
  collectionId: string | null
  status: ArticleStatus
  publishedAt: string | null
}

export type ArticlePlacement = {
  helpCenterId: string
  articleId: string
  position: number
  isHidden: boolean
  titleOverride: string | null
  bodyJsonOverride: BodyJson | null
  bodyHtmlOverride: string | null
  collectionOverrideId: string | null
}

export type EffectiveArticle = CanonicalArticle & {
  position: number
  isHidden: boolean
  /** True when any field on this article is overridden in this help center. */
  isOverridden: boolean
}

export type CanonicalCollection = {
  id: string
  slug: string
  title: string
  description: string | null
  icon: string | null
}

export type CollectionPlacement = {
  helpCenterId: string
  collectionId: string
  position: number
  isHidden: boolean
  titleOverride: string | null
  descriptionOverride: string | null
  audience: Audience
}

export type EffectiveCollection = CanonicalCollection & {
  position: number
  isHidden: boolean
  audience: Audience
  isOverridden: boolean
}
