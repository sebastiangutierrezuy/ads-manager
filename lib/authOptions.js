import GoogleProvider from 'next-auth/providers/google';

const ALLOWED_DOMAIN = process.env.AUTH_ALLOWED_DOMAIN;
const ALLOWED_EMAILS = (process.env.AUTH_ALLOWED_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);
const SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;

if (!SECRET) {
  throw new Error(
    '[auth] Falta AUTH_SECRET (o NEXTAUTH_SECRET) en .env.local. ' +
    'Generalo con: openssl rand -base64 32'
  );
}

console.log(
  `[auth] Secret cargado (${SECRET.length} chars). ` +
  `Whitelist: ${ALLOWED_EMAILS.length ? ALLOWED_EMAILS.length + ' emails' : '(ninguna)'}. ` +
  `Domain: ${ALLOWED_DOMAIN || '(ninguno)'}`
);

export const authOptions = {
  secret: SECRET,
  debug: process.env.NODE_ENV !== 'production',
  providers: [
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          // El parámetro `hd` filtra el selector de Google a un dominio específico.
          // Es solo UX — la validación real es server-side en el callback signIn.
          ...(ALLOWED_DOMAIN ? { hd: ALLOWED_DOMAIN } : {}),
          prompt: 'select_account',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const email = (profile?.email || '').toLowerCase();
      const verified = profile?.email_verified === true;
      if (!email || !verified) return false;

      // Whitelist explícita tiene prioridad: solo estos emails entran.
      if (ALLOWED_EMAILS.length > 0) {
        return ALLOWED_EMAILS.includes(email);
      }
      // Sin whitelist, fallback a chequeo por dominio (Workspace completo).
      if (ALLOWED_DOMAIN) {
        const domain = email.split('@')[1];
        return domain === ALLOWED_DOMAIN;
      }
      // Sin restricciones (no recomendado): cualquier cuenta verificada.
      return true;
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.sub;
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
};
