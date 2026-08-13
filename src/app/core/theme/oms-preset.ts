import { definePreset } from '@primeng/themes';
import Aura from '@primeng/themes/aura';

/**
 * OMS custom theme preset built on Aura.
 * - Brand primary: Indigo (cohesive with the login artwork)
 * - Neutral surfaces: Slate
 * - Elevated, rounded, professional look in both light & dark schemes.
 */
export const OmsPreset = definePreset(Aura, {
  primitive: {
    // Minimal: gentle, consistent radii.
    borderRadius: {
      none: '0',
      xs: '4px',
      sm: '6px',
      md: '8px',
      lg: '10px',
      xl: '12px',
    },
  },
  semantic: {
    // Calm indigo accent — used sparingly.
    primary: {
      50: '#eef2ff',
      100: '#e0e7ff',
      200: '#c7d2fe',
      300: '#a5b4fc',
      400: '#818cf8',
      500: '#6366f1',
      600: '#4f46e5',
      700: '#4338ca',
      800: '#3730a3',
      900: '#312e81',
      950: '#1e1b4b',
    },
    focusRing: {
      width: '2px',
      style: 'solid',
      color: '{primary.400}',
      offset: '2px',
    },
    formField: {
      paddingX: '0.85rem',
      paddingY: '0.6rem',
      borderRadius: '{border.radius.md}',
    },
    colorScheme: {
      light: {
        surface: {
          0: '#ffffff',
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e9edf2',
          300: '#d5dbe3',
          400: '#9aa3b2',
          500: '#697586',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2733',
          900: '#111722',
          950: '#0a0e16',
        },
        primary: {
          color: '{primary.600}',
          contrastColor: '#ffffff',
          hoverColor: '{primary.700}',
          activeColor: '{primary.800}',
        },
        content: {
          background: '#ffffff',
          hoverBackground: '{surface.50}',
          borderColor: '{surface.200}',
        },
        text: {
          color: '{surface.800}',
          mutedColor: '{surface.500}',
        },
      },
      dark: {
        surface: {
          0: '#ffffff',
          50: '#f8fafc',
          100: '#e2e5ea',
          200: '#c3c8d1',
          300: '#9aa1ad',
          400: '#6b7280',
          500: '#4b5261',
          600: '#363b47',
          700: '#262a33',
          800: '#1b1e26',
          900: '#14161c',
          950: '#0d0f13',
        },
        primary: {
          color: '{primary.400}',
          contrastColor: '#0d0f13',
          hoverColor: '{primary.300}',
          activeColor: '{primary.200}',
        },
        content: {
          background: '#16181d',
          hoverBackground: '#1b1e26',
          borderColor: 'rgba(255,255,255,0.08)',
        },
        text: {
          color: '#e5e7eb',
          mutedColor: '#9aa1ad',
        },
      },
    },
  },
});
