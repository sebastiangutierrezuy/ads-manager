import Link from 'next/link';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import SignOutButton from '@/components/SignOutButton';

export default async function Sidebar({ active = 'home' }) {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  const initials = user?.name
    ? user.name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase()
    : 'U';

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-name">Atlántico</div>
        <div className="brand-tag">Centro de publicidad</div>
      </div>

      <div className="nav-section">
        <div className="nav-label">Vista general</div>
        <Link className={`nav-item ${active === 'home' ? 'active' : ''}`} href="/">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12L12 3l9 9M5 10v10h14V10"/></svg>
          Resumen de hoy
        </Link>
        <Link className={`nav-item ${active === 'rendimiento' ? 'active' : ''}`} href="/rendimiento">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18M7 14l3-3 4 4 5-5"/></svg>
          Rendimiento
        </Link>
      </div>

      <div className="nav-section">
        <div className="nav-label">Tu publicidad</div>
        <span className="nav-item disabled">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          Campañas activas
        </span>
        <Link className={`nav-item ${active === 'anuncios' ? 'active' : ''}`} href="/anuncios">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>
          Anuncios
        </Link>
        <span className="nav-item disabled">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2M16 11l2 2 4-4"/></svg>
          Audiencia
        </span>
      </div>

      <div className="nav-section">
        <div className="nav-label">Asistente</div>
        <span className="nav-item disabled">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01"/></svg>
          Ayuda
        </span>
      </div>

      <div className="nav-foot">
        {user?.image ? (
          <img src={user.image} alt="" className="avatar-img" referrerPolicy="no-referrer" />
        ) : (
          <div className="avatar">{initials}</div>
        )}
        <div className="avatar-info">
          <div className="name">{user?.name || 'Sin sesión'}</div>
          <div className="biz" title={user?.email}>{user?.email || 'Meta conectado'}</div>
        </div>
        {user && <SignOutButton />}
      </div>
    </aside>
  );
}
