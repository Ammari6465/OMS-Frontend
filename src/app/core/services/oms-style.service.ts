import { Injectable, signal } from '@angular/core';

export type OmsStyleId =
  | 'sunrich-crimson'
  | 'cyber-neon'
  | 'metallic-gold'
  | 'glass-minimal'
  | 'avant-garde';

export interface OmsStyleOption {
  id: OmsStyleId;
  name: string;
  font: string;
  description: string;
  badgeClass: string;
}

const STORAGE_KEY = 'oms.writing.style';

export const OMS_STYLE_OPTIONS: OmsStyleOption[] = [
  {
    id: 'sunrich-crimson',
    name: 'Sunrich Crimson',
    font: 'Outfit',
    description: 'Signature Sunrich Red flame gradient with glowing outline (Matches Logo)',
    badgeClass: 'style-sunrich-crimson',
  },
  {
    id: 'cyber-neon',
    name: 'Cyber Neon Glow',
    font: 'Orbitron',
    description: 'Electric cyan high-tech font with neon glow aura',
    badgeClass: 'style-cyber-neon',
  },
  {
    id: 'metallic-gold',
    name: 'Metallic Gold',
    font: 'Space Grotesk',
    description: 'Prestige 3D gold & amber shimmer with sharp tracking',
    badgeClass: 'style-metallic-gold',
  },
  {
    id: 'glass-minimal',
    name: 'Glass Minimal',
    font: 'Plus Jakarta Sans',
    description: 'Ultra-clean frosted glassmorphism pill with silver text',
    badgeClass: 'style-glass-minimal',
  },
  {
    id: 'avant-garde',
    name: 'Avant-Garde Tech',
    font: 'Syne',
    description: 'Cyber-dashed monogram badge with bold futuristic typography',
    badgeClass: 'style-avant-garde',
  },
];

@Injectable({ providedIn: 'root' })
export class OmsStyleService {
  readonly currentStyle = signal<OmsStyleId>('sunrich-crimson');
  readonly styles = OMS_STYLE_OPTIONS;

  constructor() {
    const saved = localStorage.getItem(STORAGE_KEY) as OmsStyleId | null;
    if (saved && OMS_STYLE_OPTIONS.some((s) => s.id === saved)) {
      this.currentStyle.set(saved);
    }
  }

  setStyle(style: OmsStyleId): void {
    this.currentStyle.set(style);
    localStorage.setItem(STORAGE_KEY, style);
  }

  get activeOption(): OmsStyleOption {
    return OMS_STYLE_OPTIONS.find((s) => s.id === this.currentStyle()) ?? OMS_STYLE_OPTIONS[0];
  }
}
