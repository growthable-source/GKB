import { notFound } from 'next/navigation'
import { ArticleEditor } from '@/components/editor/article-editor'
import { serviceClient } from '@/lib/db/client'
import { getActiveHelpCenter } from '@/lib/tenancy/active'
import { listEffectiveCollections } from '@/lib/content/queries'
import { publishArticle, saveArticle } from '../actions'

export default async function ArticleEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const helpCenter = await getActiveHelpCenter()

  const { data: article } = await serviceClient()
    .from('articles')
    .select('id, title, body_json, collection_id, status')
    .eq('id', id)
    .maybeSingle()

  if (!article) notFound()

  const collections = await listEffectiveCollections(helpCenter.id)

  return (
    <ArticleEditor
      articleId={article.id}
      initialTitle={article.title}
      initialBodyJson={article.body_json as Record<string, unknown> | null}
      initialCollectionId={article.collection_id}
      collections={collections.map((c) => ({ id: c.id, title: c.title }))}
      onSave={saveArticle}
      onPublish={publishArticle}
    />
  )
}
