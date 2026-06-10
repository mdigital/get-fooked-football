import { redirect } from 'next/navigation';

/**
 * Shareable front door for the Flappy easter egg. The game itself lives in
 * the <Konami /> modal mounted in the root layout; `?konami=1` is its
 * documented deep-link trigger (see src/app/_konami.tsx).
 */
export default function FlappyPage() {
  redirect('/?konami=1');
}
