import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// A `?preview=<slug>` query param lets any help center be viewed on this
// deployment's own URL, ahead of a tenant domain existing — the request
// itself has no other channel to reach lib/tenancy/active.ts's
// getActiveHelpCenter(), which reads headers(), not the URL. Middleware is
// the one layer with both the URL and the ability to inject a header for
// every downstream Server Component/route handler to read.
const PREVIEW_HEADER = 'x-preview-help-center-slug'

export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers)
  const previewSlug = request.nextUrl.searchParams.get('preview')
  if (previewSlug) requestHeaders.set(PREVIEW_HEADER, previewSlug)

  let response = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request: { headers: requestHeaders } })
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Refreshes an expired session so Server Components see a valid user.
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|webp)$).*)'],
}
