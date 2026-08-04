import { notFound } from 'next/navigation'
import { ArticleEditor } from '@/components/editor/article-editor'
import { serviceClient } from '@/lib/db/client'
import { getBaseHelpCenterId } from '@/lib/tenancy/active'
import { getExcludingCenterIds } from '@/lib/tenancy/exclusions'
import { listEffectiveCollections } from '@/lib/content/queries'
import { deleteArticle, publishArticle, saveArticle, setArticleExclusions } from '../actions'

export default async function ArticleEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const baseId = await getBaseHelpCenterId()

  const { data: article } = await serviceClient()
    .from('articles')
    .select('id, title, body_json, collection_id, status')
    .eq('id', id)
    .maybeSingle()

  if (!article) notFound()

  const [collections, centers, excludedCenterIds] = await Promise.all([
    listEffectiveCollections(baseId),
    // Excludable centers only. The base center owns the shared pool, so hiding
    // an article there would remove it everywhere — see setArticleExclusions.
    serviceClient()
      .from('help_centers')
      .select('id, name, slug')
      .eq('is_base', false)
      .order('name'),
    getExcludingCenterIds(id),
  ])

  if (centers.error) throw new Error(`Could not load help centers: ${centers.error.message}`)

  return (
    <ArticleEditor
      articleId={article.id}
      initialTitle={article.title}
      initialBodyJson={article.body_json as Record<string, unknown> | null}
      initialCollectionId={article.collection_id}
      collections={collections.map((c) => ({ id: c.id, title: c.title }))}
      centers={centers.data ?? []}
      initialExcludedCenterIds={excludedCenterIds}
      onSave={saveArticle}
      onPublish={publishArticle}
      onSetExclusions={setArticleExclusions}
      onDelete={deleteArticle}
    />
  )
}
