import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy' };

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-16">
      <div className="text-[var(--color-text-accent)] font-semibold text-sm tracking-widest uppercase mb-3">
        Legal
      </div>
      <h1 className="text-[clamp(30px,5vw,48px)] font-extrabold tracking-tight mb-2">
        Privacy policy
      </h1>
      <p className="mu text-sm mb-10">Last updated: 1 January 2026</p>

      <div className="space-y-8 text-[var(--color-text-secondary)] leading-relaxed">
        <section>
          <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">What we collect</h2>
          <p>
            When you subscribe to the newsletter we store the email address you submit, and nothing
            else. When you create an account we store the identity, email and profile data managed by
            our authentication provider (Clerk). Payment receipts on the Spigot demo are settled on
            the Tempo testnet and are not tied to a personal identity.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">What we never do</h2>
          <p>
            We do not sell your data, share it with advertisers, or use it for profiling. We do not
            run third-party tracking or advertising pixels on this site.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">Wallet data</h2>
          <p>
            Spigot never asks for or stores private keys or seed phrases. Signing happens in your own
            browser or in a wallet you control. Payment proofs are public on-chain by design.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">Your rights</h2>
          <p>
            You can unsubscribe from the newsletter at any time using the link in any email. To
            request deletion of your account and associated data, email{' '}
            <a href="mailto:privacy@spigot.dev" className="underline">
              privacy@spigot.dev
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">Changes</h2>
          <p>
            Any material change to this policy will be announced in the newsletter before it takes
            effect. Questions? <Link href="/docs" className="underline">Read the docs</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}
