import { unstable_cache } from 'next/cache'
import {
  CONTENT_ARTICLES_TAG,
  CONTENT_COLLECTIONS_TAG,
  CONTENT_TTL_SECONDS,
} from '@/lib/cache/tags'
import {
  getEffectiveArticle,
  listArticleCollectionIndex,
  listEffectiveArticles,
  listEffectiveCollections,
} from './queries'

/**
 * Cross-request cached views of the readers in ./queries.ts, for public pages.
 *
 * The uncached functions stay the data layer: they are what unit tests and
 * mutations call. Only reader routes go through here, so a stale cache can
 * never feed a write. Arguments are part of the cache key automatically, so
 * the key parts below only need to identify the function.
 */
export const getCachedCollections = unstable_cache(
  listEffectiveCollections,
  ['effective-collections'],
  { tags: [CONTENT_COLLECTIONS_TAG], revalidate: CONTENT_TTL_SECONDS },
)

export const getCachedArticlesInCollection = unstable_cache(
  listEffectiveArticles,
  ['effective-articles-in-collection'],
  { tags: [CONTENT_ARTICLES_TAG], revalidate: CONTENT_TTL_SECONDS },
)

export const getCachedArticle = unstable_cache(getEffectiveArticle, ['effective-article'], {
  tags: [CONTENT_ARTICLES_TAG],
  revalidate: CONTENT_TTL_SECONDS,
})

/**
 * Cached once for the platform, not per center: the article-to-collection
 * mapping is identical everywhere. Callers subtract their own center's
 * exclusions afterwards with countArticlesPerCollection.
 */
export const getCachedArticleCollectionIndex = unstable_cache(
  listArticleCollectionIndex,
  ['article-collection-index'],
  { tags: [CONTENT_ARTICLES_TAG], revalidate: CONTENT_TTL_SECONDS },
)
