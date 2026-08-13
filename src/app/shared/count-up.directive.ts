import { Directive, ElementRef, effect, inject, input } from '@angular/core';

/**
 * Animates a numeric display value from 0 up to its target the first time it
 * renders (and whenever the value changes), preserving any surrounding text and
 * thousands separators.
 *
 * The directive owns the host element's text content, so bind the value rather
 * than interpolating it:  `<span [appCountUp]="kpi().value"></span>`.
 *
 * Accessibility & SSR safe: honours `prefers-reduced-motion` and any
 * non-browser environment by rendering the final value immediately.
 */
@Directive({
  selector: '[appCountUp]',
})
export class CountUp {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The already-formatted display value, e.g. `"1,234"` or `"12 open"`. */
  readonly appCountUp = input.required<string>();
  /** Animation length in milliseconds. */
  readonly countUpDuration = input(900);

  private frame = 0;

  constructor() {
    effect((onCleanup) => {
      this.animate(this.appCountUp());
      onCleanup(() => cancelAnimationFrame(this.frame));
    });
  }

  private animate(raw: string): void {
    const el = this.host.nativeElement;
    const match = raw.match(/-?\d[\d,]*/);
    const reduced =
      typeof window === 'undefined' ||
      typeof requestAnimationFrame === 'undefined' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // Nothing to count, or motion is unwanted/unavailable: render as-is.
    if (!match || reduced) {
      el.textContent = raw;
      return;
    }

    const target = Number(match[0].replace(/,/g, ''));
    if (!Number.isFinite(target) || target === 0) {
      el.textContent = raw;
      return;
    }

    const prefix = raw.slice(0, match.index);
    const suffix = raw.slice(match.index! + match[0].length);
    const duration = this.countUpDuration();
    const start = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic — quick, settles gently
      el.textContent = prefix + Math.round(target * eased).toLocaleString() + suffix;
      if (t < 1) this.frame = requestAnimationFrame(step);
    };

    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(step);
  }
}
