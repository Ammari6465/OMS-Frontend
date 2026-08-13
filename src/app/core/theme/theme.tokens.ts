import { OmsThemeDefinition, OmsThemeId, ThemeMode, ThemeTokens } from './theme.model';

export const OMS_THEMES: OmsThemeDefinition[] = [
  {id:'sunrich-crimson',name:'Sunrich Crimson',font:'Outfit',description:'Premium crimson gradients, warm depth and executive polish',badgeClass:'style-sunrich-crimson',effect:'radial'},
  {id:'cyber-neon',name:'Cyber Neon Glow',font:'Orbitron',description:'Electric cyan accents, precise borders and restrained glow',badgeClass:'style-cyber-neon',effect:'grid'},
  {id:'metallic-gold',name:'Metallic Gold',font:'Space Grotesk',description:'Luxury gold highlights, dark metal and soft shimmer',badgeClass:'style-metallic-gold',effect:'shimmer'},
  {id:'glass-minimal',name:'Glass Minimal',font:'Plus Jakarta Sans',description:'Frosted surfaces, silver borders and quiet motion',badgeClass:'style-glass-minimal',effect:'blobs'},
  {id:'avant-garde',name:'Avant-Garde Tech',font:'Syne',description:'Blueprint structure, technical lines and bright blue focus',badgeClass:'style-avant-garde',effect:'blueprint'},
];

const identity: Record<OmsThemeId, ThemeTokens> = {
  'sunrich-crimson': {'--oms-primary':'#ee2b2e','--oms-primary-hover':'#c91f28','--oms-secondary':'#ff6b4a','--oms-accent':'#ff8a5b','--oms-glow':'rgba(238,43,46,.28)','--oms-gradient':'linear-gradient(135deg,#ee2b2e,#ff6542)','--oms-font':'Outfit, Inter, sans-serif','--oms-border-style':'solid'},
  'cyber-neon': {'--oms-primary':'#00cfe8','--oms-primary-hover':'#00a9c2','--oms-secondary':'#38bdf8','--oms-accent':'#67e8f9','--oms-glow':'rgba(0,207,232,.3)','--oms-gradient':'linear-gradient(135deg,#00cfe8,#2563eb)','--oms-font':'Orbitron, Inter, sans-serif','--oms-border-style':'solid'},
  'metallic-gold': {'--oms-primary':'#d99a16','--oms-primary-hover':'#b7790d','--oms-secondary':'#fbbf24','--oms-accent':'#fde68a','--oms-glow':'rgba(217,154,22,.28)','--oms-gradient':'linear-gradient(135deg,#9a650b,#fbbf24 52%,#b7790d)','--oms-font':'Space Grotesk, Inter, sans-serif','--oms-border-style':'solid'},
  'glass-minimal': {'--oms-primary':'#64748b','--oms-primary-hover':'#475569','--oms-secondary':'#94a3b8','--oms-accent':'#cbd5e1','--oms-glow':'rgba(148,163,184,.2)','--oms-gradient':'linear-gradient(135deg,#64748b,#a8b4c5)','--oms-font':'Plus Jakarta Sans, Inter, sans-serif','--oms-border-style':'solid'},
  'avant-garde': {'--oms-primary':'#1689ff','--oms-primary-hover':'#0871dd','--oms-secondary':'#38bdf8','--oms-accent':'#7dd3fc','--oms-glow':'rgba(22,137,255,.28)','--oms-gradient':'linear-gradient(135deg,#0868d7,#38bdf8)','--oms-font':'Syne, Inter, sans-serif','--oms-border-style':'dashed'},
};

export function tokensFor(id: OmsThemeId, mode: ThemeMode): ThemeTokens {
  const dark=mode==='dark';
  const glass=id==='glass-minimal';
  return {...identity[id],
    '--p-primary-color':identity[id]['--oms-primary'],'--p-primary-hover-color':identity[id]['--oms-primary-hover'],
    '--oms-page-bg':dark?'#0b1019':'#f4f7fb','--oms-shell-bg':dark?'#070b12':'#edf2f8',
    '--oms-sidebar-bg':dark?(glass?'rgba(14,22,34,.82)':'#0d1420'):(glass?'rgba(255,255,255,.78)':'#ffffff'),
    '--oms-topbar-bg':dark?'rgba(13,20,32,.86)':'rgba(255,255,255,.86)',
    '--oms-input-bg':dark?'#111a28':'#ffffff','--oms-subtle-bg':dark?'#101824':'#f7f9fc',
    '--oms-elevated-bg':dark?'#141d2a':'#ffffff','--oms-surface':dark?'#101826':'#ffffff','--oms-surface-elevated':dark?'#162131':'#ffffff',
    '--oms-border':dark?'rgba(255,255,255,.1)':'#dbe3ed','--p-content-border-color':dark?'rgba(255,255,255,.1)':'#dbe3ed',
    '--p-content-background':dark?(glass?'rgba(17,26,43,.78)':'#111a2b'):(glass?'rgba(255,255,255,.76)':'#ffffff'),
    '--p-text-color':dark?'#edf3fc':'#172238','--p-text-muted-color':dark?'#98a6ba':'#64748b',
    '--oms-hover-bg':`color-mix(in srgb, ${identity[id]['--oms-primary']} 11%, transparent)`,
    '--oms-scroll-thumb':dark?'#3a4658':'#aebaca','--oms-zebra-bg':dark?'rgba(255,255,255,.03)':'rgba(15,23,42,.025)',
    '--oms-shadow':dark?'0 12px 30px rgba(0,0,0,.26)':'0 9px 25px rgba(15,23,42,.08)',
    '--oms-card-shadow':dark?'0 12px 30px rgba(0,0,0,.26)':'0 9px 25px rgba(15,23,42,.08)',
    '--oms-card-hover-shadow':`0 18px 38px -18px ${identity[id]['--oms-glow']}`,
    '--oms-focus-ring':`0 0 0 3px ${identity[id]['--oms-glow']}`,
  };
}
