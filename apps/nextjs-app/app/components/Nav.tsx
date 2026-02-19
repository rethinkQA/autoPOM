'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav>
      <Link
        href="/"
       
        className={`nav-link ${pathname === '/' ? 'active' : ''}`}
      >
        Home
      </Link>
      <Link
        href="/about"
       
        className={`nav-link ${pathname === '/about' ? 'active' : ''}`}
      >
        About
      </Link>
    </nav>
  );
}
