import { CanDeactivateFn } from '@angular/router';

/**
 * A component the workplace map guard can protect. `confirmDeactivate` is the
 * rich Save / Discard / Cancel dialog when the component offers one; the guard
 * falls back to a native prompt for anything that only reports its dirty state.
 */
export interface UnsavedWorkplace {
  hasUnsavedChanges(): boolean;
  confirmDeactivate?(): Promise<boolean>;
}

export const unsavedWorkplaceGuard: CanDeactivateFn<UnsavedWorkplace> = (component) => {
  if (!component.hasUnsavedChanges()) return true;
  // Prefer the in-app Save / Discard / Cancel workflow; fall back to a browser
  // prompt only when the component does not provide the dialog.
  return component.confirmDeactivate
    ? component.confirmDeactivate()
    : window.confirm('Discard unsaved floor-map changes?');
};
