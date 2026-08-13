export type OmsThemeId = 'sunrich-crimson' | 'cyber-neon' | 'metallic-gold' | 'glass-minimal' | 'avant-garde';
export type ThemeMode = 'light' | 'dark';

export interface OmsThemeDefinition {
  id: OmsThemeId;
  name: string;
  font: string;
  description: string;
  badgeClass: string;
  effect: 'radial' | 'grid' | 'shimmer' | 'blobs' | 'blueprint';
}

export type ThemeTokens = Record<`--${string}`, string>;
