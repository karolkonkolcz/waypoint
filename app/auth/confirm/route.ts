import { type NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);

  return NextResponse.redirect(
    new URL('/login?error=Please+sign+in+with+the+verification+code', origin),
  );
}
