import { NextResponse } from 'next/server'
import { getBaseHelpCenterId } from '@/lib/tenancy/active'
import { searchHelpCenter } from '@/lib/search/search'

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q') ?? ''
  if (!query.trim()) return NextResponse.json({ hits: [] })

  try {
    const baseId = await getBaseHelpCenterId()
    const hits = await searchHelpCenter(baseId, query, 8)
    return NextResponse.json({ hits })
  } catch (error) {
    // Log the real error server-side; the response must not leak internals.
    console.error('Search failed:', error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
