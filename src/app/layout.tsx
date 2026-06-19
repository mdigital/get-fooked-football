import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { bootstrapAdminIfNeeded } from '@/lib/auth';
import ThemeToggle from './_theme-toggle';
import { HowItWorksButton } from './_how-it-works';
import { UserMenu } from './_user-menu';
import { headers } from 'next/headers';
import { db, schema } from '@/db/client';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { avatarFor } from '@/lib/avatar';
import { displayName } from '@/lib/display-name';
import { BurnsBanner } from './_burns-banner';
import { Konami } from './_konami';
import { KonamiTrigger } from './_konami-trigger';

export const metadata: Metadata = {
  title: 'Get Fooked — 2026 World Cup tipping',
  description: 'Invite-only football tipping for cunts. Random teams, weird leaderboards, real prizes.',
};

// Primary nav. Account-y links (Profile, Preferences, How-it-works, Admin,
// Sign out) live in the avatar dropdown (see UserMenu) to save space.
const NAV: Array<[string, string]> = [
  ['Fixtures', '/fixtures'],
  ['My Teams', '/teams'],
  ['Boards', '/leaderboards'],
  ['InSwap', '/inswap'],
  ['Prizes', '/prizes'],
];

/** External BBC World Cup schedule — surfaced as the prominent "Predictions!" CTA. */
const PREDICTIONS_URL = 'https://www.bbc.co.uk/sport/football/world-cup/schedule';

// Runs synchronously before hydration so the page paints in the user's theme
// from the very first frame — no flash of wrong colours.
const THEME_BOOTSTRAP = `
(function() {
  try {
    var stored = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored === 'dark' || ((!stored || stored === 'system') && prefersDark);
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();
`;

/** Paths that signed-in-but-not-onboarded users are allowed to view. */
const ONBOARDING_ALLOWLIST = new Set(['/onboarding', '/login', '/register', '/logout']);

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  try {
    await bootstrapAdminIfNeeded();
  } catch {}
  let session: Awaited<ReturnType<typeof getSession>> | undefined;
  try {
    session = await getSession();
  } catch {}

  // Gate: a signed-in user with no onboardedAt is bounced to /onboarding.
  // Path comes from middleware (x-pathname). API/_next requests are excluded
  // by the middleware matcher so we never see them here.
  let needsOnboarding = false;
  // Read fresh from the DB so the header reflects whatever the latest
  // nickname / avatar setting is — including someone else hijacking the
  // current user from /profile/<id>. Session is just for ids + roles.
  let meRow: { name: string; nickname: string | null; avatarUrl: string | null; email: string; onboardedAt: Date | null } | null = null;
  if (session?.userId) {
    try {
      const h = await headers();
      const pathname = h.get('x-pathname') ?? '/';
      const exempt = ONBOARDING_ALLOWLIST.has(pathname) || pathname.startsWith('/api/');
      const [me] = await db
        .select({
          name: schema.users.name,
          nickname: schema.users.nickname,
          avatarUrl: schema.users.avatarUrl,
          email: schema.users.email,
          onboardedAt: schema.users.onboardedAt,
        })
        .from(schema.users)
        .where(eq(schema.users.id, session.userId))
        .limit(1);
      meRow = me ?? null;
      if (!exempt && me && !me.onboardedAt) needsOnboarding = true;
    } catch {
      // DB hiccup in the gate shouldn't blank the whole app.
    }
  }
  if (needsOnboarding) redirect('/onboarding');
  const meDisplay = meRow ? displayName(meRow) : (session?.name ?? '');

  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-screen">
        <header className="border-b-[3px] border-current">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-baseline gap-2">
              <Link href="/" className="flex items-baseline">
                <span className="text-xl md:text-2xl font-bold uppercase tracking-tight">
                  <span className="ansi-magenta">▓</span>
                  <span className="ansi-cyan">▒</span>
                  <span className="ansi-magenta">░</span>{' '}
                  GET FOOKED
                </span>
              </Link>
              {/* Triple-click this badge to flap. Mobile-friendly easter-egg trigger. */}
              <KonamiTrigger />
            </div>
            <nav className="hidden items-center gap-1 md:flex">
              {NAV.map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  className="border-[2px] border-transparent px-3 py-1 text-sm font-bold uppercase tracking-wide hover:bg-cga-cyan hover:text-cga-black"
                >
                  {label}
                </Link>
              ))}
              <a
                href={PREDICTIONS_URL}
                target="_blank"
                rel="noreferrer"
                className="ml-1 border-[2px] border-current bg-cga-magenta px-3 py-1 text-sm font-black uppercase tracking-wide text-cga-black shadow-cga hover:bg-cga-cyan"
              >
                Predictions! ↗
              </a>
            </nav>
            <div className="flex items-center gap-2 text-sm">
              <ThemeToggle />
              {session?.userId ? (
                <UserMenu
                  name={meDisplay}
                  avatarSrc={avatarFor({ email: meRow?.email ?? session.email ?? '', avatarUrl: meRow?.avatarUrl ?? session.avatarUrl ?? null }, 56)}
                  isAdmin={!!session.isAdmin}
                />
              ) : (
                <>
                  <HowItWorksButton className="hidden md:inline-flex border-[2px] border-current px-2 py-1 text-xs font-bold uppercase tracking-wide hover:bg-cga-cyan hover:text-cga-black" label="How it works" />
                  <Link href="/login" className="brutal-btn-pink text-xs">
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </div>
          <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 md:hidden">
            <a
              href={PREDICTIONS_URL}
              target="_blank"
              rel="noreferrer"
              className="whitespace-nowrap border-[2px] border-current bg-cga-magenta px-3 py-1 text-xs font-black uppercase text-cga-black shadow-cga"
            >
              Predictions! ↗
            </a>
            {NAV.map(([label, href]) => (
              <Link key={href} href={href} className="whitespace-nowrap border-[2px] border-current px-3 py-1 text-xs font-bold uppercase">
                {label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">
          {session?.userId && meRow?.onboardedAt && (
            <BurnsBanner viewerUserId={session.userId} viewerIsAdmin={!!session.isAdmin} />
          )}
          {children}
        </main>
        <Konami />
        <footer className="mx-auto max-w-6xl px-4 py-8 text-xs">
          <span className="brutal-tag-magenta">GET FOOKED</span>
          <span className="ml-2 opacity-100">
            <span className="ansi-cyan">═══</span> WC2026 <span className="ansi-cyan">═══</span>
          </span>
        </footer>
      </body>
    </html>
  );
}
