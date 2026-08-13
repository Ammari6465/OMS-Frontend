import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';

import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, InputTextModule, ButtonModule],
  template: `
    <div class="auth-form">
      @if (sent()) {
        <div class="success-state">
          <div class="success-icon"><i class="pi pi-envelope"></i></div>
          <h2>Check your email</h2>
          <p>
            If an account exists for <strong>{{ submittedEmail() }}</strong>, we've sent reset instructions.
            Please check your inbox and spam folder.
          </p>
          <a routerLink="/auth/login"><p-button label="Back to Sign In" icon="pi pi-arrow-left" styleClass="w-full sunrich-btn" /></a>
          <button type="button" class="resend" (click)="reset()">Use a different email</button>
        </div>
      } @else {
        <header class="auth-head">
          <h2>Forgot password?</h2>
          <p>Enter your registered email address and we'll help you reset your password.</p>
        </header>

        <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-column gap-3" novalidate>
          <div class="field">
            <label for="email">Email address</label>
            <input
              pInputText id="email" type="email" formControlName="email" class="w-full"
              autocomplete="email" placeholder="name@company.com"
              [attr.aria-invalid]="invalid()" [attr.aria-describedby]="invalid() ? 'email-err' : null"
            />
            @if (invalid()) {
              <small id="email-err" class="err">Please enter a valid email address.</small>
            }
          </div>
          <p-button
            type="submit"
            [label]="loading() ? 'Sending…' : 'Send Reset Link'"
            [icon]="loading() ? '' : 'pi pi-send'"
            styleClass="w-full sunrich-btn"
            [loading]="loading()" [disabled]="loading()"
          />
          <a routerLink="/auth/login" class="link text-center"><i class="pi pi-arrow-left"></i> Back to Sign In</a>
        </form>
      }
    </div>
  `,
  styles: [
    `
      .auth-head h2 { font-size: 1.6rem; margin: 0 0 0.35rem; font-weight: 800; color: var(--p-text-color); }
      .auth-head p { margin: 0 0 1.5rem; color: var(--p-text-muted-color, #a0a7b5); }
      .field { display: flex; flex-direction: column; gap: 0.4rem; }
      .field label { font-weight: 600; font-size: 0.85rem; color: var(--p-text-color); }
      .err { color: #f87171; font-size: 0.78rem; }
      .link {
        color: var(--p-primary-color); font-weight: 600; font-size: 0.85rem; display: inline-flex;
        align-items: center; gap: 0.35rem; justify-content: center;
      }
      .success-state { text-align: center; display: flex; flex-direction: column; gap: 0.5rem; }
      .success-icon {
        width: 68px; height: 68px; border-radius: 50%; display: grid; place-items: center; margin: 0 auto 0.75rem;
        background: color-mix(in srgb, var(--p-primary-color) 15%, transparent); color: var(--p-primary-color); font-size: 1.7rem;
      }
      .success-state h2 { font-size: 1.5rem; margin: 0; font-weight: 800; color: var(--p-text-color); }
      .success-state p { color: var(--p-text-muted-color); line-height: 1.6; margin: 0.25rem 0 1.25rem; }
      .success-state a { text-decoration: none; }
      .resend {
        border: none; background: none; color: var(--p-text-muted-color); cursor: pointer; font-size: 0.82rem;
        margin-top: 0.5rem;
      }
      .resend:hover { color: var(--p-primary-color); }
    `,
  ],
})
export class ForgotPassword {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  readonly loading = signal(false);
  readonly sent = signal(false);
  readonly submittedEmail = signal('');

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  invalid(): boolean {
    const c = this.form.get('email');
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  submit(): void {
    if (this.loading()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    const email = this.form.getRawValue().email;
    // Mock flow — never reveals whether the account exists (anti-enumeration).
    this.auth.forgotPassword({ email }).subscribe({
      next: () => {
        this.loading.set(false);
        this.submittedEmail.set(email);
        this.sent.set(true);
      },
      error: () => this.loading.set(false),
    });
  }

  reset(): void {
    this.sent.set(false);
    this.form.reset({ email: '' });
  }
}
