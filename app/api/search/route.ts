import { NextResponse } from 'next/server'
import { getActiveHelpCenter } from '@/lib/tenancy/active'
import { searchHelpCenter } from '@/lib/search/search'

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q') ?? ''
  if (!query.trim()) return NextResponse.json({ hits: [] })

  try {
    const helpCenter = await getActiveHelpCenter()
    const hits = await searchHelpCenter(helpCenter.id, query, 8)
    return NextResponse.json({ hits })
  } catch (error) {
    // Log the real error server-side; the response must not leak internals.
    console.error('Search failed:', error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
