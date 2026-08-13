import { Injectable, signal } from '@angular/core';

type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'oms.theme.mode';
const DARK_CLASS = 'app-dark';

/**
 * Toggles the PrimeNG dark-mode selector and persists choice.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>('dark');

  constructor() {
    // Dark is default; user choice stored in localStorage wins if present.
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    this.apply(stored ?? 'dark');
  }

  toggle(): void {
    this.apply(this.mode() === 'dark' ? 'light' : 'dark');
  }

  private apply(mode: ThemeMode): void {
    this.mode.set(mode);
    localStorage.setItem(STORAGE_KEY, mode);
    document.documentElement.classList.toggle(DARK_CLASS, mode === 'dark');
    document.documentElement.setAttribute('data-theme', mode);
  }
}
