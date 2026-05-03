import { Inter, Manrope } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata = {
  title: 'Centro de Publicidad — Atlántico',
  description: 'Gestión simple de tus campañas publicitarias en Meta',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${inter.variable} ${manrope.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
