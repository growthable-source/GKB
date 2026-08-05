import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  parseCenterPath,
  CENTER_SLUG_HEADER,
  CENTER_BASE_PATH_HEADER,
} from '@/lib/tenancy/path'

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

  // Customer help centers are addressed by path, not hostname. Rewriting hands
  // `/hc/acme/billing` to the ordinary public route for `/billing`, with the
  // brand travelling alongside in headers — so one set of pages serves every
  // center, path-addressed or host-addressed.
  const centerPath = parseCenterPath(request.nextUrl.pathname)
  let rewriteUrl: URL | null = null
  if (centerPath) {
    requestHeaders.set(CENTER_SLUG_HEADER, centerPath.slug)
    requestHeaders.set(CENTER_BASE_PATH_HEADER, centerPath.basePath)
    rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = centerPath.rewriteTo
  }

  // Supabase's setAll rebuilds the response, so both constructions have to stay
  // in step. One builder, called from both places.
  const build = () =>
    rewriteUrl
      ? NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
      : NextResponse.next({ request: { headers: requestHeaders } })

  let response = build()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = build()
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
