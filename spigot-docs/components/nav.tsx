'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignInButton, SignUpButton, UserButton, useUser } from '@clerk/nextjs';
import { ThemeSwitch } from 'fumadocs-ui/layouts/shared/slots/theme-switch';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/directory', label: 'Directory' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/demo', label: 'Demo' },
  { href: '/agent', label: 'Agent' },
  { href: '/docs', label: 'Docs' },
];

export function Nav() {
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user } = useUser();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <nav className="sticky top-0 z-50 flex items-center gap-5 px-5 py-3.5 backdrop-blur-xl bg-[var(--color-bg-nav)] border-b border-[var(--color-border-subtle)]">
      <Link href="/" className="font-extrabold text-lg tracking-tight mr-auto">
        Spigot
      </Link>

      <div className="hidden md:flex items-center gap-5">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`text-sm transition-colors ${
              isActive(link.href)
                ? 'text-[var(--color-text-accent)] font-medium'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>

      <ThemeSwitch mode="light-dark" className="flex-none border-[var(--color-border-control)]" />

      {/* Clerk auth controls */}
      {!isLoaded ? (
        <span className="w-24 h-8 rounded-full bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] animate-pulse" />
      ) : isSignedIn ? (
        <div className="flex items-center gap-2">
          <span className="hidden lg:inline text-sm text-[var(--color-text-secondary)] max-w-[10rem] truncate">
            {user?.primaryEmailAddress?.emailAddress ?? user?.username ?? 'Signed in'}
          </span>
          <UserButton />
        </div>
      ) : (
        <>
          <SignInButton mode="modal">
            <button className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">
              Sign in
            </button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button className="rounded-full border border-[var(--color-border-control)] px-4 py-1.5 text-sm font-medium hover:border-[var(--color-accent)] transition-colors">
              Sign up
            </button>
          </SignUpButton>
        </>
      )}

      <Link
        href="/agent"
        className="hidden sm:inline-flex items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-text-on-accent)] font-semibold text-sm px-5 py-2 hover:opacity-90 transition-opacity"
      >
        Launch Agent
      </Link>
    </nav>
  );
}
