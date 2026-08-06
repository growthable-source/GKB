import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getBaseHelpCenterId } from '@/lib/tenancy/active'
import { listEffectiveCollections } from '@/lib/content/queries'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { getOwnerArticle, listOwnerCollections } from '@/lib/dashboard/owned-content'
import { OwnerArticleEditor } from '@/components/dashboard/owner-article-editor'
import {
  deleteOwnerArticle,
  publishOwnerArticle,
  saveOwnerArticle,
  unpublishOwnerArticle,
} from '../actions'

export const metadata = { title: 'Edit article — Growthable' }

export default async function OwnerArticlePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [{ id }, center] = await Promise.all([params, getOwnedCenter()])
  if (!center) redirect('/get/details')

  const article = await getOwnerArticle(center.id, id)
  // Scoped read, so another tenant's id is indistinguishable from a missing
  // one — a 404 rather than a 403, which would confirm the article exists.
  if (!article) notFound()

  const baseId = await getBaseHelpCenterId()
  const [ownCollections, sharedCollections] = await Promise.all([
    listOwnerCollections(center.id),
    listEffectiveCollections(baseId),
  ])

  // Both are offered: an agency's article may belong in a section they made, or
  // in one of the shared categories their clients already browse.
  const collections = [
    ...ownCollections.map((c) => ({ id: c.id, title: c.title })),
    ...sharedCollections.map((c) => ({ id: c.id, title: `${c.title} (shared)` })),
  ]

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/articles" className="text-sm text-neutral-600 underline">
        ← All articles
      </Link>

      <OwnerArticleEditor
        articleId={article.id}
        initialTitle={article.title}
        initialBodyJson={article.body_json as Record<string, unknown> | null}
        initialBodyHtml={article.body_html ?? ''}
        initialStatus={article.status}
        initialCollectionId={article.collection_id}
        collections={collections}
        onSave={saveOwnerArticle}
        onPublish={publishOwnerArticle}
        onUnpublish={unpublishOwnerArticle}
        onDelete={deleteOwnerArticle}
      />
    </div>
  )
}
