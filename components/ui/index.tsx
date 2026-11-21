/**
 * Marketivity premium glass design layer. Server-safe (no hooks), so these
 * can be used from server and client components alike. Styles live in
 * app/styles/glass.css; tokens are CSS variables (--mk-*, --gx-*).
 */
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react';

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

/* ── Surfaces ─────────────────────────────────────────────────────── */

type GlassCardProps = HTMLAttributes<HTMLDivElement> & { flush?: boolean };

export function GlassCard({ flush, className, ...rest }: GlassCardProps) {
  return <div className={cx('gx-card', flush && 'gx-card--flush', className)} {...rest} />;
}

type GlassLinkCardProps = AnchorHTMLAttributes<HTMLAnchorElement>;

export function GlassLinkCard({ className, ...rest }: GlassLinkCardProps) {
  return <a className={cx('gx-card gx-card--interactive', className)} {...rest} />;
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="gx-card__head">
      <div>
        <div className="gx-card__title">{title}</div>
        {subtitle && <div className="gx-card__sub">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

/** Opt any element into the scroll float-in/out choreography. */
export function Reveal({ as: Tag = 'div', delay, style, ...rest }: HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' | 'li' | 'article'; delay?: number }) {
  const s = delay ? ({ ...style, '--rv-delay': `${delay}ms` } as CSSProperties) : style;
  return <Tag data-reveal="" style={s} {...rest} />;
}

/* ── Page header ──────────────────────────────────────────────────── */

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="gx-page-header" data-reveal="">
      <div className="gx-page-header__text">
        {eyebrow && <span className="gx-eyebrow">{eyebrow}</span>}
        <h1 className="gx-h1">{title}</h1>
        {description && <p className="gx-lead">{description}</p>}
      </div>
      {actions && <div className="gx-page-header__actions">{actions}</div>}
    </header>
  );
}

/* ── Buttons ──────────────────────────────────────────────────────── */

export type ButtonVariant = 'primary' | 'secondary' | 'dark' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const btnClass = (variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', block?: boolean, extra?: string) =>
  cx('gx-btn', variant !== 'secondary' && `gx-btn--${variant}`, size !== 'md' && `gx-btn--${size}`, block && 'gx-btn--block', extra);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; loading?: boolean };

export function Button({ variant, size, block, loading, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={btnClass(variant, size, block, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="gx-spinner" aria-hidden /> : null}
      {children}
    </button>
  );
}

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant; size?: ButtonSize; block?: boolean };

export function ButtonLink({ variant, size, block, className, ...rest }: ButtonLinkProps) {
  return <a className={btnClass(variant, size, block, className)} {...rest} />;
}

/* ── Badges ───────────────────────────────────────────────────────── */

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'accent';

export function Badge({ tone = 'neutral', dot, live, className, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; dot?: boolean; live?: boolean }) {
  return (
    <span className={cx('gx-badge', tone !== 'neutral' && `gx-badge--${tone}`, live && 'gx-badge--live', className)} {...rest}>
      {(dot || live) && <span className="gx-badge__dot" aria-hidden />}
      {children}
    </span>
  );
}

/** Maps Meta / portal status strings to a badge tone (display only). */
export function statusTone(status?: string | null): BadgeTone {
  const s = (status || '').toUpperCase();
  if (['ACTIVE', 'CONNECTED', 'LIVE'].includes(s)) return 'success';
  if (['PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'PENDING', 'IN_PROCESS', 'PENDING_REVIEW', 'INVITED'].includes(s)) return 'warning';
  if (['DISAPPROVED', 'WITH_ISSUES', 'ERROR', 'EXPIRED', 'REJECTED', 'DISCONNECTED'].includes(s)) return 'danger';
  if (['COMPLETED', 'ARCHIVED', 'DELETED', 'INACTIVE'].includes(s)) return 'neutral';
  return 'info';
}

/* ── Inputs ───────────────────────────────────────────────────────── */

type InputProps = InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; trailing?: ReactNode };

export function Input({ icon, trailing, className, ...rest }: InputProps) {
  if (!icon && !trailing) return <input className={cx('gx-input', className)} {...rest} />;
  return (
    <div className="gx-input-wrap">
      {icon && <span className="gx-input-icon" aria-hidden>{icon}</span>}
      <input className={cx('gx-input', className)} style={trailing ? { paddingRight: '3.25rem' } : undefined} {...rest} />
      {trailing && <span className="gx-input-trail">{trailing}</span>}
    </div>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: ReactNode; htmlFor?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="gx-field">
      <label className="gx-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="gx-hint">{hint}</p>}
    </div>
  );
}

export function Alert({ tone = 'danger', children }: { tone?: 'danger' | 'success'; children: ReactNode }) {
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={`gx-alert gx-alert--${tone}`}>{children}</div>;
}

/* ── Tables ───────────────────────────────────────────────────────── */

export function DataTable({ className, children, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="gx-table-wrap">
      <table className={cx('gx-table', className)} {...rest}>{children}</table>
    </div>
  );
}

/* ── KPI ──────────────────────────────────────────────────────────── */

export function KpiCard({ label, value, icon, foot }: { label: ReactNode; value: ReactNode; icon?: ReactNode; foot?: ReactNode }) {
  return (
    <div className="gx-card gx-kpi">
      <div className="gx-kpi__top">
        <span className="gx-kpi__label">{label}</span>
        {icon && <span className="gx-kpi__icon" aria-hidden>{icon}</span>}
      </div>
      <div className="gx-kpi__value">{value}</div>
      {foot && <div className="gx-kpi__foot">{foot}</div>}
    </div>
  );
}

/* ── Empty state ──────────────────────────────────────────────────── */

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="gx-empty">
      {icon && <div className="gx-empty__icon" aria-hidden>{icon}</div>}
      <h3 className="gx-card__title" style={{ fontSize: '1.0625rem' }}>{title}</h3>
      {children && <p className="gx-lead" style={{ maxWidth: '44ch' }}>{children}</p>}
    </div>
  );
}

/* ── Brand ────────────────────────────────────────────────────────── */

/** Vector "M" mark (orange + purple facets) from the Marketivity logo. */
export function BrandGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 32" aria-hidden>
      <polygon points="2,1 2,31 18,15" fill="#FFB061" />
      <polygon points="2,1 20,16 16,30" fill="#F7931E" />
      <polygon points="38,1 20,16 24,30" fill="#7B3FE4" />
      <polygon points="38,1 38,31 22,15" fill="#A27BE8" opacity=".9" />
    </svg>
  );
}

export function BrandMark({ tagline = 'Client Portal', href }: { tagline?: string; href?: string }) {
  const inner = (
    <>
      <span className="gx-brand__mark"><BrandGlyph /></span>
      <span>
        <span className="gx-brand__name">Marketivity</span>
        {tagline && <span className="gx-brand__tag">{tagline}</span>}
      </span>
    </>
  );
  return href ? <a className="gx-brand" href={href}>{inner}</a> : <span className="gx-brand">{inner}</span>;
}

export function Backdrop() {
  return <div className="gx-backdrop" aria-hidden />;
}
