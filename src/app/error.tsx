'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Route-level error boundary. Renders WITHIN the root layout (header,
 * footer, theme, etc. still work), so we just slot a CGA card into the
 * main content area. Triggered by any thrown error inside a server or
 * client component beneath this file.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Log to the browser console so a sympathetic friend with devtools can
  // see what blew up — and so Railway's stdout captures it too.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[RouteError]', error);
  }, [error]);

  return (
    <div className="space-y-4">
      <div className="brutal-card">
        <h1 className="brutal-h1 brutal-heading-magenta">FFS, calm down</h1>
        <p className="mt-3 text-sm">
          We&rsquo;re changing something. Come back later.
        </p>
        {error?.digest && (
          <p className="mt-3 text-xs opacity-100 font-mono">
            <span className="ansi-cyan">digest:</span> {error.digest}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={reset} className="brutal-btn-primary text-sm">
            Try again
          </button>
          <Link href="/" className="brutal-btn-ghost text-sm">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
