import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';

import { AuthService } from '../../../core/services/auth.service';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const pw = group.get('newPassword')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return pw && confirm && pw !== confirm ? { mismatch: true } : null;
}

interface Rule {
  key: string;
  label: string;
  met: boolean;
}

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink, PasswordModule, ButtonModule],
  template: `
    <div class="auth-form">
      @if (!token) {
        <div class="state-block">
          <div class="state-icon error"><i class="pi pi-times-circle"></i></div>
          <h2>Link invalid or expired</h2>
          <p>This password reset link is invalid or has expired. Please request a new one.</p>
          <a routerLink="/auth/forgot-password"><p-button label="Request a new link" icon="pi pi-refresh" styleClass="w-full sunrich-btn" /></a>
          <a routerLink="/auth/login" class="link">← Back to Sign In</a>
        </div>
      } @else if (done()) {
        <div class="state-block">
          <div class="state-icon ok"><i class="pi pi-check-circle"></i></div>
          <h2>Password updated</h2>
          <p>Your password has been reset successfully. You can now sign in with your new password.</p>
          <a routerLink="/auth/login"><p-button label="Back to Sign In" icon="pi pi-sign-in" styleClass="w-full sunrich-btn" /></a>
        </div>
      } @else {
        <header class="auth-head">
          <h2>Create new password</h2>
          <p>Choose a strong password you haven't used before.</p>
        </header>

        <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-column gap-3" novalidate>
          <div class="field">
            <label for="newPassword">New password</label>
            <p-password inputId="newPassword" formControlName="newPassword" [feedback]="false" [toggleMask]="true"
              styleClass="w-full" [inputStyleClass]="'w-full'" autocomplete="new-password" placeholder="Enter a new password" />
          </div>

          <div class="strength">
            <div class="strength-track">
              <div class="strength-fill" [style.width.%]="(metCount() / rules().length) * 100" [style.background]="strengthColor()"></div>
            </div>
            <span class="strength-label" [style.color]="strengthColor()">{{ strengthLabel() }}</span>
          </div>

          <ul class="rules">
            @for (r of rules(); track r.key) {
              <li [class.met]="r.met">
                <i class="pi" [class.pi-check-circle]="r.met" [class.pi-circle]="!r.met"></i> {{ r.label }}
              </li>
            }
          </ul>

          <div class="field">
            <label for="confirmPassword">Confirm password</label>
            <p-password inputId="confirmPassword" formControlName="confirmPassword" [feedback]="false" [toggleMask]="true"
              styleClass="w-full" [inputStyleClass]="'w-full'" autocomplete="new-password" placeholder="Re-enter the new password" />
            @if (form.hasError('mismatch') && form.get('confirmPassword')?.touched) {
              <small class="err">Passwords do not match.</small>
            }
          </div>

          <p-button
            type="submit"
            [label]="loading() ? 'Resetting…' : 'Reset Password'"
            [icon]="loading() ? '' : 'pi pi-check'"
            styleClass="w-full sunrich-btn"
            [loading]="loading()" [disabled]="loading() || form.invalid"
          />
          <a routerLink="/auth/login" class="link text-center">← Back to Sign In</a>
        </form>
      }
    </div>
  `,
  styles: [
    `
      .auth-head h2 { font-size: 1.6rem; margin: 0 0 0.35rem; font-weight: 800; color: var(--p-text-color); }
      .auth-head p { margin: 0 0 1.4rem; color: var(--p-text-muted-color, #a0a7b5); }
      .field { display: flex; flex-direction: column; gap: 0.4rem; }
      .field label { font-weight: 600; font-size: 0.85rem; color: var(--p-text-color); }
      .err { color: #f87171; font-size: 0.78rem; }
      .link { color: var(--p-primary-color); font-weight: 600; font-size: 0.85rem; display: inline-block; }
      .strength { display: flex; align-items: center; gap: 0.6rem; }
      .strength-track { flex: 1; height: 6px; border-radius: 4px; background: var(--p-content-border-color); overflow: hidden; }
      .strength-fill { height: 100%; border-radius: 4px; transition: width 0.25s ease, background 0.25s ease; }
      .strength-label { font-size: 0.75rem; font-weight: 700; min-width: 3.5rem; text-align: right; }
      .rules { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; }
      .rules li { display: flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; color: var(--p-text-muted-color); }
      .rules li i { font-size: 0.85rem; }
      .rules li.met { color: var(--p-text-color); }
      .rules li.met i { color: #34d399; }
      .state-block { text-align: center; display: flex; flex-direction: column; gap: 0.5rem; }
      .state-block a { text-decoration: none; }
      .state-icon { width: 68px; height: 68px; border-radius: 50%; display: grid; place-items: center; margin: 0 auto 0.75rem; font-size: 1.8rem; }
      .state-icon.ok { background: rgba(52, 211, 153, 0.15); color: #34d399; }
      .state-icon.error { background: rgba(248, 113, 113, 0.15); color: #f87171; }
      .state-block h2 { font-size: 1.5rem; margin: 0; font-weight: 800; color: var(--p-text-color); }
      .state-block p { color: var(--p-text-muted-color); line-height: 1.6; margin: 0.25rem 0 1.25rem; }
    `,
  ],
})
export class ResetPassword {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(false);
  readonly done = signal(false);
  readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';

  private readonly pw = signal('');

  readonly rules = computed<Rule[]>(() => {
    const v = this.pw();
    return [
      { key: 'len', label: 'At least 8 characters', met: v.length >= 8 },
      { key: 'upper', label: 'One uppercase letter', met: /[A-Z]/.test(v) },
      { key: 'num', label: 'One number', met: /[0-9]/.test(v) },
      { key: 'special', label: 'One special character', met: /[^A-Za-z0-9]/.test(v) },
    ];
  });
  readonly metCount = computed(() => this.rules().filter((r) => r.met).length);
  readonly strengthLabel = computed(() => {
    const n = this.metCount();
    if (!this.pw()) return '';
    return n <= 1 ? 'Weak' : n <= 3 ? 'Medium' : 'Strong';
  });
  readonly strengthColor = computed(() => {
    const n = this.metCount();
    return n <= 1 ? '#f87171' : n <= 3 ? '#fbbf24' : '#34d399';
  });

  readonly form = this.fb.nonNullable.group(
    {
      newPassword: ['', [Validators.required, this.strongValidator]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  constructor() {
    this.form
      .get('newPassword')!
      .valueChanges.pipe(takeUntilDestroyed())
      .subscribe((v) => this.pw.set(v ?? ''));
  }

  private strongValidator(control: AbstractControl): ValidationErrors | null {
    const v = control.value as string;
    if (!v) return null;
    const ok = v.length >= 8 && /[A-Z]/.test(v) && /[0-9]/.test(v) && /[^A-Za-z0-9]/.test(v);
    return ok ? null : { weak: true };
  }

  submit(): void {
    if (this.loading()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.auth.resetPassword({ token: this.token, newPassword: this.form.getRawValue().newPassword }).subscribe({
      next: () => {
        this.loading.set(false);
        this.done.set(true);
      },
      error: () => this.loading.set(false),
    });
  }
}
