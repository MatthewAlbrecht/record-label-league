import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Allow all /public/* routes without auth
  if (request.nextUrl.pathname.startsWith('/public')) {
    return NextResponse.next();
  }

  const session = request.cookies.get('session')?.value;

  // Protect /example
  const isExample = request.nextUrl.pathname.startsWith('/example');

  if (isExample && !session) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/example', '/example/:path*'],
};
