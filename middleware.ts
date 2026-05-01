import { updateSession } from "@/lib/supabase/middleware";
import { canonicalUrlForRequest } from "@/lib/site-url";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const canonicalUrl = canonicalUrlForRequest(request.url);
  if (canonicalUrl) return NextResponse.redirect(canonicalUrl, 308);

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};
