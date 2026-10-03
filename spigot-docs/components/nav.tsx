'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignInButton, SignUpButton, UserButton, useUser } from '@clerk/nextjs';
import { ThemeSwitch } from 'fumadocs-ui/layouts/shared/slots/theme-switch';
import { Menu, X } from 'lucide-react';

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
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <nav className="relative sticky top-0 z-50 flex items-center gap-2 px-3 py-3 backdrop-blur-xl bg-[var(--color-bg-nav)] border-b border-[var(--color-border-subtle)] md:gap-5 md:px-5 md:py-3.5">
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

      <div className="hidden md:flex items-center gap-3">
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
      </div>

      <Link
        href="/agent"
        className="hidden sm:inline-flex items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-text-on-accent)] font-semibold text-sm px-5 py-2 hover:opacity-90 transition-opacity"
      >
        Launch Agent
      </Link>

      <button
        type="button"
        aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={mobileOpen}
        aria-controls="mobile-navigation"
        onClick={() => setMobileOpen((open) => !open)}
        className="grid size-10 flex-none place-items-center rounded-full border border-[var(--color-border-control)] text-[var(--color-text-primary)] md:hidden"
      >
        {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>

      {mobileOpen && (
        <div
          id="mobile-navigation"
          className="absolute inset-x-3 top-[calc(100%+8px)] z-50 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-page)] p-3 shadow-xl md:hidden"
        >
          <div className="grid gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? 'page' : undefined}
                onClick={() => setMobileOpen(false)}
                className={`rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  isActive(link.href)
                    ? 'bg-[var(--color-bg-surface)] font-semibold text-[var(--color-text-accent)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
          {isLoaded && !isSignedIn && (
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--color-border-subtle)] pt-3">
              <SignInButton mode="modal">
                <button className="rounded-full border border-[var(--color-border-control)] px-3 py-2 text-sm font-medium text-[var(--color-text-primary)]">
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="rounded-full bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-text-on-accent)]">
                  Sign up
                </button>
              </SignUpButton>
            </div>
          )}
          {isLoaded && isSignedIn && (
            <div className="mt-3 flex items-center gap-3 border-t border-[var(--color-border-subtle)] px-3 pt-3">
              <UserButton />
              <span className="truncate text-sm text-[var(--color-text-secondary)]">
                {user?.primaryEmailAddress?.emailAddress ?? user?.username ?? 'Signed in'}
              </span>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
