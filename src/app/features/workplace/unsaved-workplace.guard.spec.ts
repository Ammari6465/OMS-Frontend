import { describe, expect, it, vi } from 'vitest';
import { unsavedWorkplaceGuard } from './unsaved-workplace.guard';

/** The guard is a plain CanDeactivateFn, so the extra router arguments are unused here. */
function run(hasUnsavedChanges: boolean) {
  return (unsavedWorkplaceGuard as any)({ hasUnsavedChanges: () => hasUnsavedChanges });
}

describe('unsavedWorkplaceGuard', () => {
  it('leaves a clean editor without prompting', () => {
    const confirm = vi.spyOn(window, 'confirm');
    expect(run(false)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('warns before discarding unsaved floor-map changes', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(run(true)).toBe(false);
    expect(confirm).toHaveBeenCalledWith('Discard unsaved floor-map changes?');
    confirm.mockRestore();
  });

  it('navigates away once the warning is accepted', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(run(true)).toBe(true);
    confirm.mockRestore();
  });

  it('prefers the in-app Save/Discard/Cancel dialog when the component provides one', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const confirmDeactivate = vi.fn().mockResolvedValue(true);
    const result = (unsavedWorkplaceGuard as any)({ hasUnsavedChanges: () => true, confirmDeactivate });
    await expect(result).resolves.toBe(true);
    expect(confirmDeactivate).toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
