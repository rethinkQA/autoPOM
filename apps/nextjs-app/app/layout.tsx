import type { Metadata } from 'next';
import Nav from './components/Nav';
import './globals.css';

export const metadata: Metadata = {
  title: 'GeneralStore — Next.js',
  description: 'GeneralStore test target built with Next.js',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <header>
          <h1>GeneralStore <span className="tech-badge">Next.js</span></h1>
          <Nav />
        </header>

        <main>
          {children}
        </main>

        <footer>
          <p>&copy; 2026 GeneralStore — Next.js Test Target</p>
        </footer>
      </body>
    </html>
  );
}
