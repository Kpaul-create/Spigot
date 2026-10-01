import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
      <div className="max-w-6xl mx-auto px-5 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div>
            <h3 className="font-bold text-lg mb-3">Spigot</h3>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
              The metered stablecoin tap for AI agents. Built on Tempo.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3 text-[var(--color-text-primary)]">Product</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/directory" className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-accent)] transition-colors">
                  Directory
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-accent)] transition-colors">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link href="/demo" className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-accent)] transition-colors">
                  Live Demo
                </Link>
              </li>
              <li>
                <Link href="/agent" className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-accent)] transition-colors">
                  Agent
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3 text-[var(--color-text-primary)]">Resources</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/docs" className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-accent)] transition-colors">
                  Documentation
                </Link>
              </li>
              <li>
                <Link href="/docs" className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-accent)] transition-colors">
                  Quickstart
                </Link>
              </li>
              <li>
                <Link href="/docs" className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-accent)] transition-colors">
                  API Reference
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3 text-[var(--color-text-primary)]">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/privacy" className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-accent)] transition-colors">
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-[var(--color-border-subtle)] flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-[var(--color-text-secondary)]">
            &copy; {new Date().getFullYear()} Spigot. All rights reserved.
          </p>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Built on Tempo blockchain
          </p>
        </div>
      </div>
    </footer>
  );
}
