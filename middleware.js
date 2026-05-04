import { withAuth } from 'next-auth/middleware';

// Middleware edge-safe: no carga providers (que usan openid-client incompatible
// con edge runtime). Solo verifica el JWT contra el secret y redirige.
export default withAuth({
  pages: { signIn: '/login' },
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
});

export const config = {
  // Corre en todas las rutas excepto:
  //  - /api/auth/*           → endpoints de NextAuth
  //  - /api/mcp              → endpoint del MCP server (Bearer / OAuth JWT)
  //  - /api/mcp/token        → OAuth token endpoint
  //  - /api/mcp/authorize    → OAuth authorize endpoint (sí pasa por middleware
  //    porque NECESITA verificar la sesión NextAuth — pero el middleware solo
  //    redirige a /login si no hay sesión, lo cual es exactamente lo que queremos)
  //  - /.well-known/*        → OAuth metadata
  //  - /login                → la pantalla de login
  //  - assets estáticos
  matcher: ['/((?!api/auth|api/mcp/token|api/mcp$|\\.well-known|login|_next|favicon.ico|.*\\..*).*)'],
};
