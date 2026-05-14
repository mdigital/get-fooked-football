/**
 * Small notification-style badge: a speech-bubble glyph with the comment count
 * overlaid as a magenta chip in the corner. Renders nothing when count == 0
 * so quiet fixtures stay visually quiet.
 */
export function ChatBadge({ count, className = '' }: { count: number; className?: string }) {
  if (count <= 0) return null;
  const display = count > 99 ? '99+' : String(count);
  return (
    <span
      className={`relative inline-flex items-center leading-none ${className}`}
      title={`${count} comment${count === 1 ? '' : 's'}`}
      aria-label={`${count} comments`}
    >
      <span aria-hidden="true">💬</span>
      <span className="ml-1 border-[2px] border-current bg-cga-magenta px-1 text-[10px] font-bold leading-none text-cga-black">
        {display}
      </span>
    </span>
  );
}
