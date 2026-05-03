import { withAuth } from 'next-auth/middleware';

// Middleware edge-safe: no carga providers (que usan openid-client incompatible
// con edge runtime). Solo verifica el JWT contra el secret y redirige.
export default withAuth({
  pages: { signIn: '/login' },
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
});

export const config = {
  // Corre en todas las rutas excepto /api/auth/*, /login, archivos estáticos.
  matcher: ['/((?!api/auth|login|_next|favicon.ico|.*\\..*).*)'],
};
