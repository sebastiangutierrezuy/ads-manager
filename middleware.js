import { withAuth } from 'next-auth/middleware';

// Middleware edge-safe: no carga providers (que usan openid-client incompatible
// con edge runtime). Solo verifica el JWT contra el secret y redirige.
export default withAuth({
  pages: { signIn: '/login' },
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
});

export const config = {
  // Corre en todas las rutas excepto:
  //  - /api/auth/*  → endpoints de NextAuth
  //  - /api/mcp     → endpoint del MCP server (auth propio por Bearer token)
  //  - /login       → la pantalla de login
  //  - assets estáticos
  matcher: ['/((?!api/auth|api/mcp|login|_next|favicon.ico|.*\\..*).*)'],
};
