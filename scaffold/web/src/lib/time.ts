const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

/** "just now", "5 min ago", "3 h ago", then a date. */
export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const s = Math.round((t - now) / 1000);
  if (Math.abs(s) < 45) return 'just now';
  const m = Math.round(s / 60);
  if (Math.abs(m) < 60) return rtf.format(m, 'minute');
  const h = Math.round(m / 60);
  if (Math.abs(h) < 24) return rtf.format(h, 'hour');
  return dateFmt.format(t);
}

export const clockTime = (iso: string): string => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : timeFmt.format(t);
};
