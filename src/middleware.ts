import { NextResponse, type NextRequest } from 'next/server';

/**
 * Forwards the current pathname as an `x-pathname` REQUEST header so the root
 * layout (a server component) can decide whether to redirect to /onboarding
 * without polluting middleware with DB calls. Skips Next internals, API
 * routes, and static uploads.
 */
export function middleware(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-pathname', req.nextUrl.pathname);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ['/((?!_next|api|uploads|favicon).*)'],
};
