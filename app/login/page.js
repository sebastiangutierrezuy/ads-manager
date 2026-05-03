import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/authOptions';
import LoginButton from '@/components/LoginButton';

export const metadata = {
  title: 'Iniciar sesión — Centro de Publicidad',
};

export default async function LoginPage({ searchParams }) {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect('/');

  const sp = await searchParams;
  const error = sp?.error;

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-name">Atlántico</div>
          <div className="brand-tag">Centro de publicidad</div>
        </div>

        <h1 className="login-title">Iniciá sesión</h1>
        <p className="login-sub">
          Acceso restringido al equipo de Atlántico Estudio.
          Ingresá con tu cuenta de Google Workspace.
        </p>

        {error && (
          <div className="login-error">
            {error === 'AccessDenied'
              ? 'Tu cuenta no pertenece al dominio autorizado. Pedí acceso al admin.'
              : 'No pudimos iniciarte sesión. Intentá de nuevo.'}
          </div>
        )}

        <LoginButton />

        <div className="login-foot">
          ¿Problemas para entrar? Hablá con el admin del Workspace.
        </div>
      </div>
    </div>
  );
}
