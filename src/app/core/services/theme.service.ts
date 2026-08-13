import { Injectable, computed, signal } from '@angular/core';
import { THEME_EFFECT_CLASS } from '../theme/theme.effects';
import { OmsThemeId, ThemeMode } from '../theme/theme.model';
import { OMS_THEMES, tokensFor } from '../theme/theme.tokens';

const MODE_KEY='oms.theme.mode'; const ID_KEY='oms.writing.style'; const DARK_CLASS='app-dark';

@Injectable({providedIn:'root'})
export class ThemeService {
  readonly mode=signal<ThemeMode>('dark'); readonly currentTheme=signal<OmsThemeId>('sunrich-crimson'); readonly themes=OMS_THEMES;
  readonly activeTheme=computed(()=>OMS_THEMES.find(theme=>theme.id===this.currentTheme())??OMS_THEMES[0]);
  private previewing=false;
  constructor(){const mode=this.validMode(localStorage.getItem(MODE_KEY));const id=this.validTheme(localStorage.getItem(ID_KEY));this.mode.set(mode);this.currentTheme.set(id);this.applyDocument(id,mode)}
  toggle():void{this.setMode(this.mode()==='dark'?'light':'dark')}
  setMode(mode:ThemeMode):void{this.mode.set(mode);localStorage.setItem(MODE_KEY,mode);this.applyDocument(this.currentTheme(),mode)}
  setTheme(id:OmsThemeId):void{if(!OMS_THEMES.some(t=>t.id===id))return;this.previewing=false;this.currentTheme.set(id);localStorage.setItem(ID_KEY,id);this.applyDocument(id,this.mode())}
  preview(id:OmsThemeId):void{if(!OMS_THEMES.some(t=>t.id===id))return;this.previewing=true;this.applyDocument(id,this.mode())}
  endPreview():void{if(!this.previewing)return;this.previewing=false;this.applyDocument(this.currentTheme(),this.mode())}
  private applyDocument(id:OmsThemeId,mode:ThemeMode):void{const root=document.documentElement;root.classList.toggle(DARK_CLASS,mode==='dark');root.setAttribute('data-theme',mode);root.setAttribute('data-oms-theme',id);root.classList.remove(...Object.values(THEME_EFFECT_CLASS));root.classList.add(THEME_EFFECT_CLASS[id]);Object.entries(tokensFor(id,mode)).forEach(([name,value])=>root.style.setProperty(name,value))}
  private validMode(value:string|null):ThemeMode{return value==='light'||value==='dark'?value:'dark'}
  private validTheme(value:string|null):OmsThemeId{return OMS_THEMES.some(t=>t.id===value)?value as OmsThemeId:'sunrich-crimson'}
}
