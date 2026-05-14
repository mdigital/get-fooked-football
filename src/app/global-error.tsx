'use client';

import { useEffect } from 'react';
import './globals.css';

/**
 * Last-resort error boundary. Catches errors thrown by the root layout
 * itself, so Next.js will NOT render the layout around it — we have to
 * provide our own <html> and <body>. Keep this file dependency-free:
 * imports from `@/db`, `@/lib/session`, etc. could be exactly what's
 * crashing.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          background: '#000',
          color: '#fff',
          fontFamily: '"IBM Plex Mono", "DejaVu Sans Mono", "Menlo", ui-monospace, monospace',
          minHeight: '100vh',
          margin: 0,
          padding: '2rem 1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          role="alert"
          style={{
            border: '3px solid #fff',
            background: '#000',
            color: '#fff',
            padding: '1.5rem',
            maxWidth: '40rem',
            width: '100%',
            boxShadow: '4px 4px 0 0 #ff55ff',
          }}
        >
          <h1
            style={{
              display: 'inline-block',
              background: '#ff55ff',
              color: '#000',
              border: '3px solid #000',
              padding: '0.25rem 0.75rem',
              boxShadow: '4px 4px 0 0 #000',
              margin: 0,
              fontSize: '1.5rem',
              textTransform: 'uppercase',
              fontWeight: 700,
              letterSpacing: '-0.02em',
            }}
          >
            FFS, calm down
          </h1>
          <p style={{ marginTop: '1rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
            We&rsquo;re changing something. Come back later.
          </p>
          {error?.digest && (
            <p style={{ marginTop: '1rem', fontSize: '0.75rem', opacity: 0.8, fontFamily: 'inherit' }}>
              <span style={{ color: '#55ffff' }}>digest:</span> {error.digest}
            </p>
          )}
          <div style={{ marginTop: '1.25rem' }}>
            <button
              type="button"
              onClick={reset}
              style={{
                border: '3px solid #fff',
                background: '#000',
                color: '#fff',
                padding: '0.5rem 1rem',
                fontFamily: 'inherit',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                cursor: 'pointer',
                boxShadow: '4px 4px 0 0 #fff',
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
