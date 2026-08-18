import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { Router } from '@angular/router';

import { OrgDataService } from '../../core/data/org-data.service';
import { ChangePasswordError } from '../../core/models/auth.model';
import { ROLE_LABELS } from '../../core/models/enums';
import { AuthService } from '../../core/services/auth.service';
import { Assignment, WorkplaceService } from '../workplace/workplace.service';

interface ProfileDetail {
  icon: string;
  label: string;
  value: string;
}

interface PasswordRule {
  key: string;
  label: string;
  met: boolean;
}

function trimmedRequired(control: AbstractControl): ValidationErrors | null {
  return String(control.value ?? '').trim() ? null : { required: true };
}

function strongPassword(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '');
  if (!value) return null;
  const valid = value.length >= 8 && /[A-Z]/.test(value) && /[0-9]/.test(value) && /[^A-Za-z0-9]/.test(value);
  return valid ? null : { weak: true };
}

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('newPassword')?.value;
  const confirmation = group.get('confirmPassword')?.value;
  return password && confirmation && password !== confirmation ? { mismatch: true } : null;
}

@Component({
  selector: 'app-profile',
  imports: [
    ReactiveFormsModule,
    AvatarModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    PasswordModule,
  ],
  template: `
    <div class="oms-page profile-page">
      <div class="oms-page-header">
        <div>
          <h1 class="oms-page-title">My Profile</h1>
          <p class="oms-page-subtitle">Manage your personal information and account settings.</p>
        </div>
      </div>

      @if (user(); as currentUser) {
        <section class="profile-hero oms-surface-card" aria-labelledby="profile-name">
          <div class="hero-avatar" aria-label="Profile avatar">
            @if (profilePhoto()) {
              <p-avatar [image]="profilePhoto()" size="xlarge" shape="circle" styleClass="profile-avatar" />
            } @else {
              <p-avatar [label]="initials()" size="xlarge" shape="circle" styleClass="profile-avatar" />
            }
          </div>

          <div class="hero-copy">
            <div class="hero-badges">
              <span class="role-pill"><i class="pi pi-shield"></i>{{ roleLabel() }}</span>
              @if (accountStatus(); as status) {
                <span class="status-pill" [class.inactive]="status === 'Inactive'">
                  <i class="pi" [class.pi-check-circle]="status === 'Active'" [class.pi-ban]="status === 'Inactive'"></i>
                  {{ status }}
                </span>
              }
            </div>
            <h2 id="profile-name">{{ currentUser.fullName || currentUser.username }}</h2>
            <p class="hero-email">{{ currentUser.email }}</p>
            <p class="hero-org"><i class="pi pi-building"></i>{{ organisationSummary() }}</p>
          </div>

          <p-button label="Edit Profile" icon="pi pi-pencil" (onClick)="openEditProfile()" />
        </section>

        <div class="profile-grid">
          <section class="profile-card" aria-labelledby="personal-title">
            <div class="card-heading">
              <span class="card-icon"><i class="pi pi-user"></i></span>
              <div><h2 id="personal-title">Personal Information</h2><p>Your contact and identity details</p></div>
            </div>
            <dl class="detail-list">
              @for (detail of personalDetails(); track detail.label) {
                <div class="detail-row">
                  <dt><i [class]="detail.icon"></i>{{ detail.label }}</dt>
                  <dd>{{ detail.value }}</dd>
                </div>
              }
            </dl>
          </section>

          <section class="profile-card" aria-labelledby="organisation-title">
            <div class="card-heading">
              <span class="card-icon"><i class="pi pi-sitemap"></i></span>
              <div><h2 id="organisation-title">Organisation Information</h2><p>Managed by your organisation</p></div>
            </div>
            @if (organisationDetails().length) {
              <dl class="detail-list">
                @for (detail of organisationDetails(); track detail.label) {
                  <div class="detail-row">
                    <dt><i [class]="detail.icon"></i>{{ detail.label }}</dt>
                    <dd>{{ detail.value }}</dd>
                  </div>
                }
              </dl>
            } @else {
              <div class="empty-assignment">
                <i class="pi pi-building"></i>
                <strong>No organisation assignment linked</strong>
                <span>Company, department and position details will appear when linked to your account.</span>
              </div>
            }
          </section>

          <section class="profile-card" aria-labelledby="account-title">
            <div class="card-heading">
              <span class="card-icon"><i class="pi pi-id-card"></i></span>
              <div><h2 id="account-title">Account Information</h2><p>Login identity and access level</p></div>
            </div>
            <dl class="detail-list">
              @for (detail of accountDetails(); track detail.label) {
                <div class="detail-row">
                  <dt><i [class]="detail.icon"></i>{{ detail.label }}</dt>
                  <dd>{{ detail.value }}</dd>
                </div>
              }
            </dl>
          </section>

          <section class="profile-card" aria-labelledby="workplace-title">
            <div class="card-heading"><span class="card-icon"><i class="pi pi-map-marker"></i></span><div><h2 id="workplace-title">My Workplace</h2><p>Your assigned office seating</p></div></div>
            @if(workplace();as location){<dl class="detail-list"><div class="detail-row"><dt><i class="pi pi-building"></i>Office</dt><dd>{{location.officeName}}</dd></div><div class="detail-row"><dt><i class="pi pi-map"></i>Building / Floor</dt><dd>{{location.buildingName}} · {{location.floorName}}</dd></div><div class="detail-row"><dt><i class="pi pi-th-large"></i>Zone / Desk</dt><dd>{{location.zoneName||'Unzoned'}} · {{location.deskCode}}</dd></div><div class="detail-row"><dt><i class="pi pi-phone"></i>Extension</dt><dd>{{location.telephoneExtension||'Not assigned'}}</dd></div><div class="detail-row"><dt><i class="pi pi-calendar"></i>Effective from</dt><dd>{{location.effectiveFrom}}</dd></div></dl><p-button label="View on floor map" icon="pi pi-map-marker" [outlined]="true" (onClick)="viewWorkplace(location)"/>}@else{<div class="empty-assignment"><i class="pi pi-desktop"></i><strong>No desk assigned</strong><span>Your workplace will appear here after an administrator assigns a desk.</span></div>}
          </section>

          <section class="profile-card relationship-card" aria-labelledby="relationship-title">
            <div class="card-heading"><span class="card-icon"><i class="pi pi-share-alt"></i></span><div><h2 id="relationship-title">Organisation Relationship</h2><p>Your place in the reporting structure</p></div></div>
            @if(staffRecord()){
              <div class="relationship-map" aria-label="Company, department, manager and current profile relationship">
                @if(companyRecord();as company){<button class="relationship-node company-node" (click)="navigate('/companies')"><i class="pi pi-building"></i><span>Company</span><strong>{{company.name}}</strong></button>}
                @if(departmentRecord();as department){<span class="relationship-line"></span><button class="relationship-node" (click)="navigate('/departments')"><i class="pi pi-sitemap"></i><span>Department</span><strong>{{department.name}}</strong></button>}
                @if(managerRecord();as manager){<span class="relationship-line"></span><button class="relationship-node" (click)="navigate('/organogram')"><i class="pi pi-user"></i><span>Manager</span><strong>{{manager.name}}</strong></button>}
                <span class="relationship-line"></span><button class="relationship-node you-node" (click)="navigate('/organogram')"><span class="mini-avatar">{{initials()}}</span><span>You</span><strong>{{staffRecord()?.title || positionRecord()?.title || 'Staff member'}}</strong></button>
              </div>
            }@else{<div class="empty-assignment"><i class="pi pi-share-alt"></i><strong>No reporting relationship linked</strong><span>Your relationship map appears after a staff profile is assigned.</span></div>}
          </section>

          <section class="profile-card security-card" aria-labelledby="security-title">
            <div class="security-copy">
              <div class="card-heading">
                <span class="card-icon"><i class="pi pi-lock"></i></span>
                <div><h2 id="security-title">Security</h2><p>Password and current session</p></div>
              </div>
              <div class="session-summary">
                <span><i class="pi pi-circle-fill"></i>Current session active</span>
                <span>Signed in as <strong>{{ currentUser.username }}</strong></span>
              </div>
            </div>
            <div class="security-actions">
              <p-button label="Change Password" icon="pi pi-key" [outlined]="true" (onClick)="openPasswordDialog()" />
              <p-button label="Sign Out" icon="pi pi-sign-out" severity="secondary" [text]="true" (onClick)="signOut()" />
            </div>
          </section>
        </div>
      } @else {
        <section class="profile-card load-error" role="alert">
          <i class="pi pi-exclamation-circle"></i>
          <h2>Unable to load profile</h2>
          <p>Your authenticated account information is unavailable. Please sign in again.</p>
          <p-button label="Sign In" icon="pi pi-sign-in" (onClick)="signOut()" />
        </section>
      }

      <p-dialog [(visible)]="editVisible" [modal]="true" [style]="{ width: '34rem' }"
        [breakpoints]="{ '640px': 'calc(100vw - 1rem)' }" header="Edit Profile" [draggable]="false"
        [closable]="!editSaving()" [closeOnEscape]="!editSaving()" (onHide)="resetEditForm()">
        <form id="edit-profile-form" [formGroup]="editForm" (ngSubmit)="saveProfile()" class="dialog-form" novalidate>
          <p class="dialog-intro">Update your personal details. Organisation and access fields are managed by administrators.</p>

          <div class="field">
            <label for="profile-full-name">Full name <span aria-hidden="true">*</span></label>
            <input pInputText id="profile-full-name" type="text" formControlName="fullName" class="w-full"
              autocomplete="name" maxlength="120" [attr.aria-invalid]="editInvalid('fullName')"
              [attr.aria-describedby]="editInvalid('fullName') ? 'profile-full-name-error' : null" />
            @if (editInvalid('fullName')) {
              <small id="profile-full-name-error" class="field-error">Enter a name between 2 and 120 characters.</small>
            }
          </div>

          <div class="field">
            <label for="profile-email">Email address <span aria-hidden="true">*</span></label>
            <input pInputText id="profile-email" type="email" formControlName="email" class="w-full"
              autocomplete="email" maxlength="150" [attr.aria-invalid]="editInvalid('email')"
              [attr.aria-describedby]="editInvalid('email') ? 'profile-email-error' : null" />
            @if (editInvalid('email')) {
              <small id="profile-email-error" class="field-error">Enter a valid email address.</small>
            }
          </div>

          <div class="field">
            <label for="profile-username">Username</label>
            <input pInputText id="profile-username" type="text" [value]="user()?.username || ''" class="w-full" readonly />
            <small class="field-help"><i class="pi pi-lock"></i> Username is managed by your administrator.</small>
          </div>
        </form>
        <ng-template #footer>
          <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="editSaving()" (onClick)="cancelEdit()" />
          <p-button type="submit" form="edit-profile-form" [label]="editSaving() ? 'Saving…' : 'Save Changes'"
            icon="pi pi-check" [loading]="editSaving()" [disabled]="editSaving()" (onClick)="saveProfile()" />
        </ng-template>
      </p-dialog>

      @if (passwordVisible) {
      <p-dialog [(visible)]="passwordVisible" [modal]="true" [style]="{ width: '36rem' }"
        [breakpoints]="{ '640px': 'calc(100vw - 1rem)' }" header="Change Password" [draggable]="false"
        [closable]="!passwordSaving()" [closeOnEscape]="!passwordSaving()" (onHide)="resetPasswordForm()">
        <form id="change-password-form" [formGroup]="passwordForm" (ngSubmit)="changePassword()" class="dialog-form" novalidate>
          <p class="dialog-intro">Choose a strong password for your local OMS account.</p>

          @if (passwordError()) {
            <div class="inline-alert" role="alert"><i class="pi pi-exclamation-circle"></i>{{ passwordError() }}</div>
          }

          <div class="field">
            <label for="current-password">Current password <span aria-hidden="true">*</span></label>
            <p-password inputId="current-password" formControlName="currentPassword" [feedback]="false" [toggleMask]="true"
              styleClass="w-full" [inputStyleClass]="'w-full'" autocomplete="current-password" placeholder="Enter current password" />
            @if (passwordInvalid('currentPassword')) { <small class="field-error">Current password is required.</small> }
          </div>

          <div class="field">
            <label for="new-password">New password <span aria-hidden="true">*</span></label>
            <p-password inputId="new-password" formControlName="newPassword" [feedback]="false" [toggleMask]="true"
              styleClass="w-full" [inputStyleClass]="'w-full'" autocomplete="new-password" placeholder="Enter new password" />
          </div>

          <div class="strength-row" aria-live="polite">
            <div class="strength-track"><span [style.width.%]="passwordStrength() * 25" [style.background]="strengthColor()"></span></div>
            <strong [style.color]="strengthColor()">{{ strengthLabel() }}</strong>
          </div>
          <ul class="password-rules" aria-label="Password requirements">
            @for (rule of passwordRules(); track rule.key) {
              <li [class.met]="rule.met"><i class="pi" [class.pi-check-circle]="rule.met" [class.pi-circle]="!rule.met"></i>{{ rule.label }}</li>
            }
          </ul>

          <div class="field">
            <label for="confirm-password">Confirm new password <span aria-hidden="true">*</span></label>
            <p-password inputId="confirm-password" formControlName="confirmPassword" [feedback]="false" [toggleMask]="true"
              styleClass="w-full" [inputStyleClass]="'w-full'" autocomplete="new-password" placeholder="Re-enter new password" />
            @if (passwordForm.hasError('mismatch') && passwordForm.get('confirmPassword')?.touched) {
              <small class="field-error">Passwords do not match.</small>
            }
          </div>
        </form>
        <ng-template #footer>
          <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="passwordSaving()" (onClick)="cancelPassword()" />
          <p-button type="submit" form="change-password-form" [label]="passwordSaving() ? 'Changing…' : 'Change Password'"
            icon="pi pi-key" [loading]="passwordSaving()" [disabled]="passwordSaving()" (onClick)="changePassword()" />
        </ng-template>
      </p-dialog>
      }
    </div>
  `,
  styles: [
    `
      .profile-page { max-width: 1240px; }
      .profile-hero { position: relative; display: flex; align-items: center; gap: 1.4rem; padding: 1.6rem; margin-bottom: 1.25rem; overflow: hidden; isolation:isolate;background:linear-gradient(135deg,color-mix(in srgb,var(--p-primary-color) 9%,var(--p-content-background)),var(--p-content-background) 65%);box-shadow:0 22px 50px -35px color-mix(in srgb,var(--p-primary-color) 55%,transparent); }
      .profile-hero::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 4px; background: var(--p-primary-color); }
      .profile-hero::after{content:'';position:absolute;right:-70px;top:-120px;width:280px;height:280px;border-radius:50%;z-index:-1;background:radial-gradient(circle,color-mix(in srgb,var(--p-primary-color) 18%,transparent),transparent 68%)}
      .hero-avatar { position:relative;flex: 0 0 auto; padding: 5px; border: 1px solid color-mix(in srgb, var(--p-primary-color) 48%, transparent); border-radius: 50%;box-shadow:0 18px 35px -18px color-mix(in srgb,var(--p-primary-color) 70%,transparent),inset 0 1px rgba(255,255,255,.3);transform:perspective(600px) translateZ(18px); }
      .hero-avatar::before{content:'';position:absolute;inset:-8px;border:1px solid color-mix(in srgb,var(--p-primary-color) 20%,transparent);border-radius:50%}.hero-avatar::after{content:'';position:absolute;right:3px;bottom:8px;width:15px;height:15px;border-radius:50%;background:#22c55e;border:3px solid var(--p-content-background);box-shadow:0 0 0 2px rgba(34,197,94,.2)}
      :host ::ng-deep .profile-avatar { width: 5.25rem !important; height: 5.25rem !important; background: color-mix(in srgb, var(--p-primary-color) 16%, var(--p-content-background)); color: var(--p-primary-color); font-size: 1.45rem; font-weight: 800; }
      :host ::ng-deep .profile-avatar img { object-fit: cover; }
      .hero-copy { flex: 1; min-width: 0; }
      .hero-copy h2 { margin: 0.45rem 0 0.15rem; font-size: 1.55rem; line-height: 1.2; }
      .hero-email, .hero-org { margin: 0; color: var(--p-text-muted-color); overflow-wrap: anywhere; }
      .hero-org { display: flex; align-items: center; gap: 0.45rem; margin-top: 0.55rem; font-size: 0.85rem; }
      .hero-badges { display: flex; flex-wrap: wrap; gap: 0.45rem; }
      .role-pill, .status-pill { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.24rem 0.65rem; border-radius: 999px; font-size: 0.72rem; font-weight: 700; }
      .role-pill { color: #7dc1ff; background: rgba(15,139,253,.12); border: 1px solid rgba(15,139,253,.3); }
      .status-pill { color: #6ee7b7; background: rgba(16,185,129,.1); border: 1px solid rgba(16,185,129,.26); }
      .status-pill.inactive { color: #fca5a5; background: rgba(239,68,68,.1); border-color: rgba(239,68,68,.28); }
      .profile-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.25rem; }
      .profile-card { min-width: 0; padding: 1.35rem; background: var(--oms-glass-strong); -webkit-backdrop-filter: var(--oms-glass-filter); backdrop-filter: var(--oms-glass-filter); border: 1px solid var(--oms-glass-border); border-radius: var(--oms-radius); box-shadow: var(--oms-glass-shadow);transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease; }
      .profile-card:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--p-primary-color) 24%,var(--p-content-border-color));box-shadow:0 18px 34px -25px rgba(0,0,0,.55)}
      .card-heading { display: flex; align-items: center; gap: 0.75rem; padding-bottom: 1rem; border-bottom: 1px solid var(--p-content-border-color); }
      .card-heading h2 { margin: 0; font-size: 1rem; }
      .card-heading p { margin: 0.15rem 0 0; color: var(--p-text-muted-color); font-size: 0.78rem; }
      .card-icon { display: grid; place-items: center; width: 2.45rem; height: 2.45rem; flex: 0 0 auto; border-radius: 10px; color: var(--p-primary-color); background: rgba(15,139,253,.12); }
      .detail-list { margin: 0; }
      .detail-row { display: grid; grid-template-columns: minmax(8rem, .75fr) minmax(0, 1.25fr); gap: 1rem; padding: 0.8rem 0; border-bottom: 1px solid color-mix(in srgb, var(--p-content-border-color) 75%, transparent); }
      .detail-row:last-child { border-bottom: 0; padding-bottom: 0; }
      .detail-row dt { display: flex; align-items: center; gap: 0.5rem; color: var(--p-text-muted-color); font-size: 0.8rem; }
      .detail-row dt i { width: 1rem; color: var(--p-primary-color); text-align: center; }
      .detail-row dd { margin: 0; color: var(--p-text-color); font-weight: 600; text-align: right; overflow-wrap: anywhere; }
      .empty-assignment { min-height: 12rem; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.45rem; padding: 1.5rem; text-align: center; color: var(--p-text-muted-color); }
      .empty-assignment > i { font-size: 1.6rem; color: var(--p-primary-color); }
      .empty-assignment strong { color: var(--p-text-color); }
      .empty-assignment span { max-width: 24rem; font-size: 0.8rem; }
      .security-card { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 1.25rem; }
      .relationship-card{overflow:hidden}.relationship-map{display:flex;align-items:stretch;gap:.45rem;padding:1.25rem 0 .2rem;overflow-x:auto;perspective:850px}.relationship-node{position:relative;display:flex;flex:1;min-width:115px;flex-direction:column;align-items:center;justify-content:center;gap:.22rem;padding:.8rem .55rem;border:1px solid var(--p-content-border-color);border-radius:12px;background:color-mix(in srgb,var(--p-primary-color) 5%,var(--p-content-background));color:var(--p-text-color);cursor:pointer;box-shadow:0 13px 24px -20px rgba(0,0,0,.65);transition:transform .18s ease,border-color .18s ease}.relationship-node:hover,.relationship-node:focus-visible{transform:translateY(-3px) translateZ(12px);border-color:var(--p-primary-color);outline:0}.relationship-node>i{color:var(--p-primary-color)}.relationship-node span{font-size:.65rem;text-transform:uppercase;letter-spacing:.05em;color:var(--p-text-muted-color)}.relationship-node strong{font-size:.75rem;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.relationship-line{align-self:center;flex:0 0 16px;height:1px;background:linear-gradient(90deg,var(--p-content-border-color),var(--p-primary-color))}.mini-avatar{display:grid!important;place-items:center;width:29px;height:29px;border-radius:50%;background:var(--p-primary-color);color:#fff!important;font-size:.72rem!important}.you-node{border-color:color-mix(in srgb,var(--p-primary-color) 42%,transparent)}
      .security-copy { flex: 1; }
      .session-summary { display: flex; flex-wrap: wrap; gap: 0.7rem 1.25rem; padding-top: 0.9rem; color: var(--p-text-muted-color); font-size: 0.82rem; }
      .session-summary span { display: inline-flex; align-items: center; gap: 0.4rem; }
      .session-summary .pi-circle-fill { color: #34d399; font-size: 0.48rem; }
      .session-summary strong { color: var(--p-text-color); }
      .security-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.5rem; }
      .dialog-form { display: flex; flex-direction: column; gap: 1rem; }
      .dialog-intro { margin: 0 0 0.25rem; color: var(--p-text-muted-color); font-size: 0.84rem; line-height: 1.55; }
      .field { display: flex; flex-direction: column; gap: 0.42rem; }
      .field label { color: var(--p-text-color); font-size: 0.82rem; font-weight: 650; }
      .field-error { color: #f87171; font-size: 0.76rem; }
      .field-help { display: flex; align-items: center; gap: 0.35rem; color: var(--p-text-muted-color); font-size: 0.74rem; }
      input[readonly] { opacity: .68; cursor: not-allowed; }
      .inline-alert { display: flex; align-items: center; gap: 0.55rem; padding: 0.7rem 0.8rem; border: 1px solid rgba(248,113,113,.32); border-radius: 9px; background: rgba(248,113,113,.1); color: #fca5a5; font-size: 0.8rem; }
      .strength-row { display: flex; align-items: center; gap: 0.7rem; }
      .strength-track { flex: 1; height: 6px; overflow: hidden; border-radius: 99px; background: var(--p-content-border-color); }
      .strength-track span { display: block; height: 100%; border-radius: inherit; transition: width .2s ease, background .2s ease; }
      .strength-row strong { min-width: 3.5rem; font-size: 0.72rem; text-align: right; }
      .password-rules { display: grid; grid-template-columns: 1fr 1fr; gap: 0.45rem; margin: 0; padding: 0; list-style: none; }
      .password-rules li { display: flex; align-items: center; gap: 0.4rem; color: var(--p-text-muted-color); font-size: 0.76rem; }
      .password-rules li.met { color: var(--p-text-color); }
      .password-rules li.met i { color: #34d399; }
      .load-error { display: flex; min-height: 18rem; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
      .load-error > i { color: #f87171; font-size: 2rem; }
      .load-error h2 { margin: 0.8rem 0 0.2rem; }
      .load-error p { margin: 0 0 1rem; color: var(--p-text-muted-color); }
      @media (max-width: 800px) { .profile-grid { grid-template-columns: 1fr; } .security-card { grid-column: auto; align-items: stretch; flex-direction: column; } .security-actions { justify-content: flex-start; } }
      @media (max-width: 600px) { .profile-page { padding: 1rem; } .profile-hero { align-items: flex-start; flex-wrap: wrap; padding: 1.25rem; } .hero-copy { flex-basis: calc(100% - 7rem); } .profile-hero > p-button { width: 100%; } :host ::ng-deep .profile-hero > p-button .p-button { width: 100%; } .detail-row { grid-template-columns: 1fr; gap: 0.25rem; } .detail-row dd { text-align: left; padding-left: 1.5rem; } .password-rules { grid-template-columns: 1fr; } .security-actions { flex-direction: column; } :host ::ng-deep .security-actions .p-button { width: 100%; } }
      @media (prefers-reduced-motion: no-preference) { .hero-avatar{animation:profile-float 5s ease-in-out infinite}@keyframes profile-float{50%{transform:perspective(600px) translateY(-4px) translateZ(22px)}} }
      @media (prefers-reduced-motion: reduce) { .strength-track span,.profile-card,.relationship-node { transition: none; }.hero-avatar{animation:none} }
    `,
  ],
})
export class Profile {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly org = inject(OrgDataService);
  private readonly workplaceApi = inject(WorkplaceService);
  private readonly router = inject(Router, { optional: true });

  readonly user = this.auth.currentUser;
  readonly editSaving = signal(false);
  readonly passwordSaving = signal(false);
  readonly passwordError = signal('');
  readonly workplace = signal<Assignment | null>(null);
  readonly newPassword = signal('');

  editVisible = false;
  passwordVisible = false;

  readonly editForm = this.fb.nonNullable.group({
    fullName: ['', [trimmedRequired, Validators.minLength(2), Validators.maxLength(120)]],
    email: ['', [trimmedRequired, Validators.email, Validators.maxLength(150)]],
  });

  readonly passwordForm = this.fb.nonNullable.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, strongPassword]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  readonly staffRecord = computed(() => {
    const id = this.user()?.staffId;
    return id == null ? undefined : this.org.staff.snapshot(true).find((staff) => staff.id === id);
  });
  readonly companyRecord = computed(() => {
    const id = this.staffRecord()?.companyId ?? this.user()?.companyId;
    return id == null ? undefined : this.org.companies.snapshot(true).find((company) => company.id === id);
  });
  readonly departmentRecord = computed(() => {
    const id = this.staffRecord()?.deptId;
    return id == null ? undefined : this.org.departments.snapshot(true).find((department) => department.id === id);
  });
  readonly managerRecord = computed(() => {
    const id = this.staffRecord()?.managerId;
    return id == null ? undefined : this.org.staff.snapshot(true).find((staff) => staff.id === id);
  });
  readonly positionRecord = computed(() => {
    const id = this.staffRecord()?.id;
    return id == null ? undefined : this.org.positions.snapshot(true).find((position) => position.staffId === id);
  });

  readonly initials = computed(() => {
    const source = this.user()?.fullName || this.user()?.username || '?';
    const parts = source.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts.at(-1)?.[0] ?? '' : '')).toUpperCase();
  });
  readonly profilePhoto = computed(() => this.staffRecord()?.photoUrl?.trim() ?? '');
  readonly roleLabel = computed(() => {
    const role = this.user()?.role;
    return role ? ROLE_LABELS[role] : 'Unknown role';
  });
  // A profile is only available after /auth/me has revalidated the account.
  readonly accountStatus = computed(() => this.user() ? 'Active' : null);
  readonly organisationSummary = computed(() => {
    const values = [
      this.staffRecord()?.title ?? this.positionRecord()?.title,
      this.departmentRecord()?.name,
      this.companyRecord()?.name,
    ].filter((value): value is string => !!value);
    return values.length ? values.join(' · ') : 'No organisation assignment linked';
  });
  readonly personalDetails = computed<ProfileDetail[]>(() => {
    const user = this.user();
    if (!user) return [];
    const details: ProfileDetail[] = [
      { icon: 'pi pi-user', label: 'Full name', value: user.fullName?.trim() || 'Not provided' },
      { icon: 'pi pi-at', label: 'Username', value: user.username },
      { icon: 'pi pi-envelope', label: 'Email', value: user.email || 'Not provided' },
    ];
    const phone = this.staffRecord()?.cellNumber || this.staffRecord()?.landline;
    if (this.staffRecord()) details.push({ icon: 'pi pi-phone', label: 'Phone', value: phone || 'Not provided' });
    return details;
  });
  readonly organisationDetails = computed<ProfileDetail[]>(() => {
    const details: ProfileDetail[] = [];
    const staff = this.staffRecord();
    const company = this.companyRecord();
    const department = this.departmentRecord();
    const position = staff?.title || this.positionRecord()?.title;
    if (company) details.push({ icon: 'pi pi-building', label: 'Company', value: company.name });
    if (department) details.push({ icon: 'pi pi-sitemap', label: 'Department', value: department.name });
    if (position) details.push({ icon: 'pi pi-briefcase', label: 'Position', value: position });
    if (staff?.employeeCode) details.push({ icon: 'pi pi-id-card', label: 'Employee code', value: staff.employeeCode });
    if (this.managerRecord()) details.push({ icon: 'pi pi-user', label: 'Manager', value: this.managerRecord()!.name });
    return details;
  });
  readonly accountDetails = computed<ProfileDetail[]>(() => {
    const user = this.user();
    if (!user) return [];
    const details: ProfileDetail[] = [
      { icon: 'pi pi-at', label: 'Username', value: user.username },
      { icon: 'pi pi-shield', label: 'Role', value: this.roleLabel() },
    ];
    if (this.accountStatus()) details.push({ icon: 'pi pi-check-circle', label: 'Account status', value: this.accountStatus()! });
    details.push({ icon: 'pi pi-circle-fill', label: 'Current session', value: 'Active' });
    return details;
  });

  readonly passwordRules = computed<PasswordRule[]>(() => {
    const value = this.newPassword();
    return [
      { key: 'length', label: 'At least 8 characters', met: value.length >= 8 },
      { key: 'uppercase', label: 'One uppercase letter', met: /[A-Z]/.test(value) },
      { key: 'number', label: 'One number', met: /[0-9]/.test(value) },
      { key: 'special', label: 'One special character', met: /[^A-Za-z0-9]/.test(value) },
    ];
  });
  readonly passwordStrength = computed(() => this.passwordRules().filter((rule) => rule.met).length);
  readonly strengthLabel = computed(() => {
    if (!this.newPassword()) return '';
    return this.passwordStrength() <= 1 ? 'Weak' : this.passwordStrength() <= 3 ? 'Medium' : 'Strong';
  });
  readonly strengthColor = computed(() => {
    if (!this.newPassword()) return 'var(--p-content-border-color)';
    return this.passwordStrength() <= 1 ? '#f87171' : this.passwordStrength() <= 3 ? '#fbbf24' : '#34d399';
  });

  navigate(route:string):void{if(this.router)void this.router.navigate([route])}

  constructor() {
    this.passwordForm.controls.newPassword.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => this.newPassword.set(value));
    const staffId=this.user()?.staffId;if(staffId!=null)this.workplaceApi.current(staffId).subscribe({next:value=>this.workplace.set(value),error:()=>this.workplace.set(null)});
  }

  viewWorkplace(location:Assignment):void{void this.router?.navigate(['/workplaces/floors',location.floorId,'map'],{queryParams:{deskId:location.deskId}})}

  openEditProfile(): void {
    const user = this.user();
    if (!user) return;
    this.editForm.reset({ fullName: user.fullName ?? '', email: user.email });
    this.editVisible = true;
  }

  editInvalid(controlName: 'fullName' | 'email'): boolean {
    const control = this.editForm.controls[controlName];
    return control.invalid && (control.touched || control.dirty);
  }

  saveProfile(): void {
    if (this.editSaving()) return;
    const raw = this.editForm.getRawValue();
    this.editForm.patchValue({ fullName: raw.fullName.trim(), email: raw.email.trim() });
    this.editForm.updateValueAndValidity();
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    this.editSaving.set(true);
    this.auth.updateProfile(this.editForm.getRawValue()).subscribe({
      next: () => {
        this.editSaving.set(false);
        this.editVisible = false;
        this.messages.add({ severity: 'success', summary: 'Profile updated', detail: 'Your personal information was saved successfully.' });
      },
      error: () => {
        this.editSaving.set(false);
        this.messages.add({ severity: 'error', summary: 'Unable to update profile', detail: 'Please try again.' });
      },
    });
  }

  cancelEdit(): void {
    if (this.editSaving()) return;
    this.resetEditForm();
    this.editVisible = false;
  }

  resetEditForm(): void {
    if (!this.editSaving()) this.editForm.reset();
  }

  openPasswordDialog(): void {
    this.resetPasswordForm();
    this.passwordVisible = true;
  }

  passwordInvalid(controlName: 'currentPassword' | 'newPassword' | 'confirmPassword'): boolean {
    const control = this.passwordForm.controls[controlName];
    return control.invalid && (control.touched || control.dirty);
  }

  changePassword(): void {
    if (this.passwordSaving()) return;
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    this.passwordError.set('');
    this.passwordSaving.set(true);
    this.auth.changePassword({ currentPassword, newPassword }).subscribe({
      next: () => {
        this.passwordSaving.set(false);
        this.passwordVisible = false;
        this.resetPasswordForm();
        this.messages.add({ severity: 'success', summary: 'Password changed', detail: 'Your password was updated successfully.' });
      },
      error: (error: ChangePasswordError) => {
        this.passwordSaving.set(false);
        this.passwordError.set(
          error.code === 'INCORRECT_CURRENT_PASSWORD'
            ? 'The current password is incorrect.'
            : error.code === 'PASSWORD_REUSE'
              ? 'Choose a password different from your current password.'
              : 'Unable to change the password. Please sign in again.',
        );
      },
    });
  }

  cancelPassword(): void {
    if (this.passwordSaving()) return;
    this.resetPasswordForm();
    this.passwordVisible = false;
  }

  resetPasswordForm(): void {
    if (this.passwordSaving()) return;
    this.passwordForm.reset();
    this.newPassword.set('');
    this.passwordError.set('');
  }

  signOut(): void {
    this.auth.logout();
  }
}
