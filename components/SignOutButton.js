'use client';

import { signOut } from 'next-auth/react';

export default function SignOutButton() {
  return (
    <button
      type="button"
      className="logout-btn"
      title="Cerrar sesión"
      aria-label="Cerrar sesión"
      onClick={() => signOut({ callbackUrl: '/login' })}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
      </svg>
    </button>
  );
}
