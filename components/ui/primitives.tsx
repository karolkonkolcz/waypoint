/**
 * Shared visual primitives for the redesigned screens (Home / Today / Weather).
 * Built from the design comps: chips, eyebrow labels, mono stat tiles, section
 * headers, progress bars. Keep these dumb + presentational.
 */
import { cn } from '@/lib/utils';

type ChipTone = 'neutral' | 'success' | 'warn' | 'brand' | 'glass';

const CHIP_TONE: Record<ChipTone, string> = {
  neutral: 'bg-secondary text-secondary-foreground',
  success: 'bg-[#e7f5ec] text-[#1c7c43]',
  warn: 'bg-[#fdece4] text-[#b4521a]',
  brand: 'bg-[var(--wp-orange)] text-white',
  glass: 'bg-white/85 text-[var(--wp-ink)] backdrop-blur',
};

export function Chip({
  children,
  tone = 'neutral',
  icon,
  className,
}: {
  children: React.ReactNode;
  tone?: ChipTone;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold leading-none',
        CHIP_TONE[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Uppercase micro-label used above values and section content. */
export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A mono value with an eyebrow caption — the Distance / Ascent / ETA tiles. */
export function StatTile({
  value,
  label,
  className,
}: {
  value: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <span className="font-mono text-base font-semibold tabular-nums leading-tight text-foreground">
        {value}
      </span>
      <Eyebrow>{label}</Eyebrow>
    </div>
  );
}

/** Section title + optional subtitle, with an optional action on the right. */
export function SectionHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between', className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-bold leading-tight text-foreground">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/** Thin progress bar (0..1), brand orange fill. `className` styles the track. */
export function ProgressBar({
  value,
  className,
  fillClassName,
}: {
  value: number;
  className?: string;
  fillClassName?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-white/25', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-full bg-[var(--wp-orange)]', fillClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
