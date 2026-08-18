import { CanDeactivateFn } from '@angular/router';
export interface UnsavedWorkplace { hasUnsavedChanges():boolean }
export const unsavedWorkplaceGuard:CanDeactivateFn<UnsavedWorkplace>=(component)=>!component.hasUnsavedChanges()||window.confirm('Discard unsaved floor-map changes?');
