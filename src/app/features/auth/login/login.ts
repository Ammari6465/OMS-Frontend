import { AfterViewInit, Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';

import { AuthService } from '../../../core/services/auth.service';
import { AuthError, AuthErrorCode } from '../../../core/models/auth.model';
import { DEMO_ACCOUNTS } from '../../../core/services/demo-accounts';
import { OrgDataService } from '../../../core/data/org-data.service';
import { NotificationService } from '../../../core/data/notification.service';
import { forkJoin } from 'rxjs';

interface UiError {
  summary: string;
  detail: string;
}

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, InputTextModule, PasswordModule, ButtonModule, CheckboxModule],
  template: `
    <div class="auth-form">
      <header class="auth-head">
        <h2>Welcome back</h2>
        <p>Sign in to your Sunrich corporate account.</p>
      </header>

      @if (error(); as e) {
        <div class="auth-alert" role="alert" aria-live="assertive">
          <i class="pi pi-exclamation-circle"></i>
          <div><strong>{{ e.summary }}</strong><span>{{ e.detail }}</span></div>
        </div>
      }

      <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-column gap-3" novalidate>
        <div class="field">
          <label for="username">Username</label>
          <input
            #usernameInput
            pInputText
            id="username"
            formControlName="username"
            class="w-full"
            autocomplete="username"
            placeholder="Enter your username"
            (input)="syncAutofilledValues()"
            (change)="syncAutofilledValues()"
            (blur)="syncAutofilledValues()"
            [attr.aria-invalid]="invalid('username')"
            [attr.aria-describedby]="invalid('username') ? 'username-err' : null"
          />
          @if (invalid('username')) {
            <small id="username-err" class="err">Username is required.</small>
          }
        </div>

        <div class="field">
          <label for="password">Password</label>
          <p-password
            inputId="password"
            formControlName="password"
            [feedback]="false"
            [toggleMask]="true"
            styleClass="w-full"
            [inputStyleClass]="'w-full'"
            autocomplete="current-password"
            placeholder="Enter your password"
            (input)="syncAutofilledValues()"
            (change)="syncAutofilledValues()"
            (blur)="syncAutofilledValues()"
          />
          @if (invalid('password')) {
            <small id="password-err" class="err">Password is required.</small>
          }
        </div>

        <div class="options-row">
          <div class="remember">
            <p-checkbox formControlName="rememberMe" [binary]="true" inputId="rememberMe" />
            <label for="rememberMe">Remember me</label>
          </div>
          <a routerLink="/auth/forgot-password" class="link">Forgot password?</a>
        </div>

        <p-button
          type="submit"
          [label]="loading() ? 'Signing in…' : 'Sign In'"
          [icon]="loading() ? '' : 'pi pi-sign-in'"
          styleClass="w-full sunrich-btn"
          [loading]="loading()"
          [disabled]="loading()"
        />
      </form>

      <div class="demo-block">
        <button type="button" class="demo-toggle" (click)="showDemo.set(!showDemo())"
          [attr.aria-expanded]="showDemo()">
          <i class="pi" [class.pi-chevron-down]="!showDemo()" [class.pi-chevron-up]="showDemo()"></i>
          Demo access (development)
        </button>
        @if (showDemo()) {
          <div class="demo-list">
            @for (a of demoAccounts; track a.username) {
              <button type="button" class="demo-chip" (click)="fillDemo(a.username, a.password)">
                <strong>{{ a.label }}</strong><span>{{ a.username }} / {{ a.password }}</span>
              </button>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .auth-head h2 {
        font-size: 1.6rem;
        margin: 0 0 0.35rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        color: var(--p-text-color);
      }
      .auth-head p {
        margin: 0 0 1.6rem;
        color: var(--p-text-muted-color, #a0a7b5);
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }
      .field label {
        font-weight: 600;
        font-size: 0.85rem;
        color: var(--p-text-color);
      }
      .err {
        color: #f87171;
        font-size: 0.78rem;
      }
      .auth-alert {
        display: flex;
        gap: 0.6rem;
        align-items: flex-start;
        padding: 0.75rem 0.9rem;
        margin-bottom: 1.1rem;
        border-radius: 10px;
        border: 1px solid rgba(248, 113, 113, 0.35);
        background: rgba(248, 113, 113, 0.12);
        color: var(--p-text-color);
      }
      .auth-alert i {
        color: #f87171;
        margin-top: 0.1rem;
      }
      .auth-alert strong {
        display: block;
        font-size: 0.85rem;
      }
      .auth-alert span {
        font-size: 0.8rem;
        color: var(--p-text-muted-color);
      }
      .options-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
      }
      .remember {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .remember label {
        font-size: 0.85rem;
        color: var(--p-text-muted-color);
        cursor: pointer;
        user-select: none;
      }
      .link {
        color: var(--p-primary-color);
        font-size: 0.85rem;
        font-weight: 600;
      }
      .demo-block {
        margin-top: 1.75rem;
        border-top: 1px solid var(--p-content-border-color);
        padding-top: 1rem;
      }
      .demo-toggle {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        border: none;
        background: none;
        cursor: pointer;
        color: var(--p-text-muted-color);
        font-size: 0.78rem;
        padding: 0;
      }
      .demo-toggle:hover {
        color: var(--p-primary-color);
      }
      .demo-list {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        margin-top: 0.65rem;
      }
      .demo-chip {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        padding: 0.5rem 0.7rem;
        border: 1px solid var(--p-content-border-color);
        border-radius: 8px;
        background: transparent;
        color: var(--p-text-color);
        cursor: pointer;
        font-size: 0.78rem;
        transition: border-color 0.15s, background 0.15s;
      }
      .demo-chip:hover {
        border-color: var(--p-primary-color);
        background: color-mix(in srgb, var(--p-primary-color) 8%, transparent);
      }
      .demo-chip span {
        color: var(--p-text-muted-color);
        font-family: ui-monospace, monospace;
      }
    `,
  ],
})
export class Login implements AfterViewInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly org = inject(OrgDataService);
  private readonly notifications = inject(NotificationService);

  @ViewChild('usernameInput') private usernameInput?: ElementRef<HTMLInputElement>;

  readonly loading = signal(false);
  readonly error = signal<UiError | null>(null);
  readonly showDemo = signal(false);

  readonly demoAccounts = DEMO_ACCOUNTS.map((a) => ({
    username: a.username,
    password: a.password,
    label: a.user.fullName ?? a.username,
  }));

  private readonly errorMap: Record<AuthErrorCode, UiError> = {
    INVALID_CREDENTIALS: {
      summary: 'Invalid credentials',
      detail: 'Invalid username or password. Please check your credentials and try again.',
    },
    INACTIVE: {
      summary: 'Account inactive',
      detail: 'Your account is currently inactive. Please contact your administrator.',
    },
    LOCKED: {
      summary: 'Account locked',
      detail: 'Your account is locked due to repeated failed login attempts. Please try again later.',
    },
    GENERIC: { summary: 'Something went wrong', detail: 'Please check your connection and try again.' },
  };

  readonly form = this.fb.nonNullable.group({
    // Email is not required for login; this form accepts usernames only.
    username: ['', Validators.required],
    password: ['', Validators.required],
    rememberMe: [false],
  });

  constructor() {
    if (this.route.snapshot.queryParamMap.get('reason') === 'session-expired') {
      this.error.set({ summary: 'Session expired', detail: 'Your session has expired. Please sign in again.' });
    }
  }

  ngAfterViewInit(): void {
    queueMicrotask(() => {
      this.usernameInput?.nativeElement.focus();
      this.syncAutofilledValues();
    });
    setTimeout(() => this.syncAutofilledValues(), 100);
    setTimeout(() => this.syncAutofilledValues(), 500);
  }

  syncAutofilledValues(): void {
    const passwordEl = document.getElementById('password') as HTMLInputElement | null;
    if (passwordEl && passwordEl.value && !this.form.controls.password.value) {
      this.form.controls.password.setValue(passwordEl.value);
      this.form.controls.password.updateValueAndValidity();
    }
    const usernameEl = document.getElementById('username') as HTMLInputElement | null;
    if (usernameEl && usernameEl.value && !this.form.controls.username.value) {
      this.form.controls.username.setValue(usernameEl.value);
      this.form.controls.username.updateValueAndValidity();
    }
  }

  invalid(control: string): boolean {
    const c = this.form.get(control);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  fillDemo(username: string, password: string): void {
    this.form.patchValue({ username, password });
    this.error.set(null);
  }

  submit(): void {
    if (this.loading()) return; // prevent duplicate submissions
    this.syncAutofilledValues();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set(null);
    this.loading.set(true);
    const { username, password, rememberMe } = this.form.getRawValue();

    this.auth.login({ username, password }, rememberMe).subscribe({
      next: () => {
        forkJoin([this.org.init(), this.notifications.init()]).subscribe({
          next: () => this.completeLogin(),
          // Authentication has already succeeded. A temporary dashboard-data
          // failure must not leave the user trapped on the login screen.
          error: () => this.completeLogin(),
        });
      },
      error: (err: AuthError | unknown) => {
        this.loading.set(false);
        const authErr = err as AuthError;
        const code = authErr?.code ?? 'GENERIC';
        const baseErr = this.errorMap[code] ?? this.errorMap.GENERIC;
        const message = authErr?.message;
        const detail = message && message !== baseErr.summary ? message : baseErr.detail;
        this.error.set({
          summary: baseErr.summary,
          detail,
        });
      },
    });
  }

  private completeLogin(): void {
    const target = this.safeRedirect(this.route.snapshot.queryParamMap.get('redirect'));
    void this.router.navigateByUrl(target).finally(() => this.loading.set(false));
  }

  /** Only allow internal absolute paths; block open-redirects to external URLs. */
  private safeRedirect(url: string | null): string {
    if (!url || !url.startsWith('/') || url.startsWith('//') || url.startsWith('/auth')) return '/dashboard';
    return url;
  }
}
