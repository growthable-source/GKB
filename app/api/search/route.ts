import { NextResponse } from 'next/server'
import { getActiveHelpCenter, getBaseHelpCenterId } from '@/lib/tenancy/active'
import { getExcludedArticleIds } from '@/lib/tenancy/exclusions'
import { searchHelpCenter } from '@/lib/search/search'

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q') ?? ''
  if (!query.trim()) return NextResponse.json({ hits: [] })

  try {
    const [helpCenter, baseId] = await Promise.all([getActiveHelpCenter(), getBaseHelpCenterId()])
    const excluded = await getExcludedArticleIds(helpCenter.id)
    const hits = await searchHelpCenter(baseId, query, 8, excluded)
    return NextResponse.json({ hits })
  } catch (error) {
    // Log the real error server-side; the response must not leak internals.
    console.error('Search failed:', error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
