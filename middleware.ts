import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const DEFAULT_REDIRECT_PATH = "/login";

export function middleware(request: NextRequest) {
  const redirectPath = process.env.TEMP_GLOBAL_REDIRECT_TO || DEFAULT_REDIRECT_PATH;
  const currentPath = request.nextUrl.pathname;

  // Prevent redirect loops when the request is already on the target route.
  if (currentPath === redirectPath || currentPath === `${redirectPath}/`) {
    return NextResponse.next();
  }

  const redirectUrl = new URL(redirectPath, request.url);
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
