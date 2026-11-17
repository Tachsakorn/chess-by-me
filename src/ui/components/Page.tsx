import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import styles from './Page.module.css';

interface PageProps {
  /** `fixed`: fits the screen; `scroll`: the whole page scrolls (Courses, Settings since 1.1);
   *  `scrollWhenShort`: fits the screen while its content fits above the floating bar, and
   *  scrolls when it does not (Home). */
  mode: 'fixed' | 'scroll' | 'scrollWhenShort';
  children: ReactNode;
  className?: string;
  /** False for a screen without the floating menu bar (Settings): less room kept at the bottom. */
  floatingBar?: boolean;
}

/**
 * Where the content of `main` ends, from its top: the lowest bottom edge (with its margin) of the
 * children laid out in the page. Floating bars, dialogs and the probe do not count. The same in
 * both layouts, so the choice between them cannot flip back and forth.
 */
function contentBottom(main: HTMLElement): number {
  const top = main.getBoundingClientRect().top;
  let bottom = 0;
  for (const child of main.children) {
    const style = getComputedStyle(child);
    if (style.position === 'fixed' || style.position === 'absolute' || child.tagName === 'DIALOG') {
      continue;
    }
    const edge = child.getBoundingClientRect().bottom + parseFloat(style.marginBottom || '0');
    bottom = Math.max(bottom, edge - top);
  }
  return bottom;
}

export function Page({ mode, children, className, floatingBar = true }: PageProps) {
  const main = useRef<HTMLElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);

  // Decided by measuring, not by a fixed screen height (Fable review A7-01: at 760-815px tall
  // iPad landscape the content of Home was hidden behind the menu bar and could not scroll).
  useLayoutEffect(() => {
    if (mode !== 'scrollWhenShort') return;
    const element = main.current;
    if (!element) return;
    const measure = () => {
      const clearance = probe.current?.offsetHeight ?? 0;
      setOverflows(contentBottom(element) + clearance > window.innerHeight + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [mode, overflows]);

  const kind = mode === 'scrollWhenShort' ? (overflows ? 'scroll' : 'fit') : mode;
  return (
    <main ref={main} className={`${styles[kind]}${className ? ` ${className}` : ''}`}>
      {children}
      {mode === 'scrollWhenShort' && (
        <span
          ref={probe}
          aria-hidden="true"
          className={`${styles.probe}${floatingBar ? '' : ` ${styles.probeNoBar}`}`}
        />
      )}
    </main>
  );
}
