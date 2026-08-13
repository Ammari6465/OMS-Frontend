import { Injectable, inject } from '@angular/core';
import { OmsThemeDefinition, OmsThemeId } from '../theme/theme.model';
import { OMS_THEMES } from '../theme/theme.tokens';
import { ThemeService } from './theme.service';

export type OmsStyleId=OmsThemeId; export type OmsStyleOption=OmsThemeDefinition; export const OMS_STYLE_OPTIONS=OMS_THEMES;
/** Compatibility facade for existing selector consumers; the full application theme is owned by ThemeService. */
@Injectable({providedIn:'root'})
export class OmsStyleService {
  private readonly engine=inject(ThemeService); readonly currentStyle=this.engine.currentTheme; readonly styles=this.engine.themes;
  setStyle(style:OmsStyleId):void{this.engine.setTheme(style)} preview(style:OmsStyleId):void{this.engine.preview(style)} endPreview():void{this.engine.endPreview()}
  get activeOption():OmsStyleOption{return this.engine.activeTheme()}
}
