'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Avatar } from './_avatar';
import { HowItWorksButton } from './_how-it-works';

/**
 * Avatar dropdown in the header. Collapses the account-y links (profile,
 * preferences, how-it-works, admin, sign out) under one trigger so the top bar
 * stays uncluttered. Closes on outside-click, Escape, or selecting an item.
 */
export function UserMenu({
  name,
  avatarSrc,
  isAdmin,
}: {
  name: string;
  avatarSrc: string;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  const item =
    'block w-full text-left px-3 py-2 text-xs font-bold uppercase tracking-wide hover:bg-cga-cyan hover:text-cga-black';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 border-[2px] border-current px-1.5 py-1 hover:bg-cga-cyan hover:text-cga-black"
        title="Account"
      >
        <Avatar src={avatarSrc} name={name} size={28} />
        <span className="hidden font-bold sm:inline">{name}</span>
        <span aria-hidden className="text-[0.6rem] leading-none">▼</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-52 border-[3px] border-current bg-white text-cga-black shadow-cga dark:bg-cga-black dark:text-cga-white"
        >
          <Link role="menuitem" href="/profile" className={item} onClick={close}>
            Profile
          </Link>
          <Link role="menuitem" href="/preferences" className={item} onClick={close}>
            Preferences
          </Link>
          <HowItWorksButton className={item} label="How it works" onClick={close} />
          {isAdmin && (
            <Link role="menuitem" href="/admin" className={item} onClick={close}>
              Admin
            </Link>
          )}
          <form action="/api/auth/logout" method="post" className="border-t-[2px] border-current">
            <button
              type="submit"
              role="menuitem"
              className={`${item} hover:bg-cga-magenta`}
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
