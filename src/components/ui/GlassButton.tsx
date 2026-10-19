'use client';
import { useEffect, useRef, type MouseEventHandler, type ReactNode } from 'react';
import './glass-button.css';
import { registerStroke } from './glassStroke';
import { startGradient } from './glassGradient';

/** The original's corner arrow (lucide corner-down-right) */
export const CornerArrow = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m15 10 5 5-5 5" /><path d="M4 4v7a4 4 0 0 0 4 4h12" />
  </svg>
);

type Props = {
  label: string;
  href?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  size?: 'sm' | 'md';
  /** icon after the label; pass `null` for none (default: the corner arrow) */
  icon?: ReactNode | null;
  className?: string;
  ariaLabel?: string;
  dataDir?: string;
};

/**
 * "Let's talk"-style button, copied from the original: smoky animated gradient, pointer-following 1px stroke,
 * glow under the button on hover and a label that rolls up. Renders an <a> when `href` is given, a <button> otherwise.
 */
export default function GlassButton({ label, href, onClick, size = 'sm', icon, className = '', ariaLabel, dataDir }: Props) {
  const root = useRef<HTMLElement | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const a = registerStroke(root.current), b = startGradient(canvas.current);
    return () => { a(); b(); };
  }, []);
  const cls = `gb gb--${size}${className ? ' ' + className : ''}`;
  const inner = (
    <>
      <span className="gb__canvas" aria-hidden="true"><canvas ref={canvas} /></span>
      <span className="gb__label"><span>{label}</span><span aria-hidden="true">{label}</span></span>
      {icon !== null && <span className="gb__icon" aria-hidden="true">{icon ?? <CornerArrow />}</span>}
      <span className="gb__shadow" aria-hidden="true" />
    </>
  );
  return href !== undefined ? (
    <a ref={(el) => { root.current = el; }} href={href} onClick={onClick} className={cls} aria-label={ariaLabel} data-dir={dataDir}>{inner}</a>
  ) : (
    <button ref={(el) => { root.current = el; }} type="button" onClick={onClick} className={cls} aria-label={ariaLabel} data-dir={dataDir}>{inner}</button>
  );
}
