import { Component, effect, inject, input, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { Router } from '@angular/router';
import { OrganogramApiService } from './organogram-api.service';
import { OrganogramNode, OrganogramStaffDetails } from './organogram.models';
import { OrganogramStore } from './organogram.store';
import { Assignment, WorkplaceService } from '../workplace/workplace.service';
@Component({
  selector: 'app-organogram-details-drawer',
  imports: [ButtonModule],
  template: `@if (node()) {
    <div class="scrim" (click)="close()"></div>
    <aside role="dialog" aria-modal="true" aria-label="Employee details" tabindex="-1">
      <header>
        <button aria-label="Close employee details" (click)="close()">
          <i class="pi pi-times"></i></button
        ><span>{{ initials() }}</span>
        <h2>{{ node()!.name }}</h2>
        <p>{{ node()!.title || 'No title' }}</p>
      </header>
      <section>
        @if (loading()) {
          <p>Loading employee details…</p>
        } @else if (details(); as d) {
          <dl>
            <div>
              <dt>Employee code</dt>
              <dd>{{ d.employeeCode || '—' }}</dd>
            </div>
            <div>
              <dt>Department</dt>
              <dd>{{ department() }}</dd>
            </div>
            <div>
              <dt>Manager</dt>
              <dd>{{ manager() }}</dd>
            </div>
            <div>
              <dt>Employment</dt>
              <dd>{{ d.employmentType }}</dd>
            </div>
            <div>
              <dt>Joined</dt>
              <dd>{{ d.dateJoined || '—' }}</dd>
            </div>
            @if (d.email) {
              <div>
                <dt>Email</dt>
                <dd>{{ d.email }}</dd>
              </div>
            }
            @if (d.cellNumber || d.landline) {
              <div>
                <dt>Telephone</dt>
                <dd>{{ d.cellNumber || d.landline }}</dd>
              </div>
            }
            @if (workplace(); as w) {
              <div>
                <dt>Workplace</dt>
                <dd>{{ w.officeName }} · {{ w.floorName }} · {{ w.deskCode }}</dd>
              </div>
            }
          </dl>
          @if (workplace(); as w) {
            <p-button
              label="View workplace"
              icon="pi pi-map-marker"
              [outlined]="true"
              (onClick)="openWorkplace(w)"
            />
          }
        } @else {
          <p>Employee details are unavailable.</p>
        }
      </section>
    </aside>
  }`,
  styles: [
    `
      .scrim {
        position: fixed;
        inset: 0;
        background: #0007;
        z-index: 60;
      }
      aside {
        position: fixed;
        right: 0;
        top: 0;
        bottom: 0;
        width: min(380px, 94vw);
        z-index: 61;
        background: var(--oms-glass-strong);
        border-left: 1px solid var(--p-content-border-color);
        box-shadow: -10px 0 30px #0005;
      }
      header {
        text-align: center;
        padding: 1.5rem;
        background: var(--p-primary-color);
        color: white;
      }
      header button {
        position: absolute;
        right: 1rem;
        border: 0;
        background: #fff2;
        color: white;
        border-radius: 8px;
        width: 34px;
        height: 34px;
      }
      header > span {
        display: grid;
        place-items: center;
        width: 64px;
        height: 64px;
        border-radius: 50%;
        margin: auto;
        background: #fff3;
        font-size: 1.4rem;
        font-weight: 800;
      }
      header h2 {
        margin: 0.6rem 0 0.1rem;
      }
      header p {
        margin: 0;
      }
      section {
        padding: 1.2rem;
        overflow: auto;
      }
      dl > div {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.65rem 0;
        border-bottom: 1px solid var(--p-content-border-color);
      }
      dt {
        color: var(--p-text-muted-color);
      }
      dd {
        margin: 0;
        text-align: right;
      }
    `,
  ],
})
export class OrganogramDetailsDrawer {
  readonly node = input<OrganogramNode | null>(null);
  readonly s = inject(OrganogramStore);
  private api = inject(OrganogramApiService);
  private workplaceApi = inject(WorkplaceService);
  private router = inject(Router);
  readonly details = signal<OrganogramStaffDetails | null>(null);
  readonly workplace = signal<Assignment | null>(null);
  readonly loading = signal(false);
  private request = 0;
  constructor() {
    effect(() => {
      const n = this.node();
      const id = n?.staffId;
      if (!id) {
        this.details.set(null);
        this.workplace.set(null);
        return;
      }
      const token = ++this.request;
      this.loading.set(true);
      this.api.details(id).subscribe({
        next: (d) => {
          if (token === this.request) this.details.set(d);
        },
        error: () => {
          if (token === this.request) this.details.set(null);
        },
        complete: () => {
          if (token === this.request) this.loading.set(false);
        },
      });
      this.workplaceApi.current(id).subscribe({
        next: (w) => {
          if (token === this.request) this.workplace.set(w);
        },
        error: () => {
          if (token === this.request) this.workplace.set(null);
        },
      });
    });
  }
  close() {
    this.s.select(null);
  }
  initials() {
    const p = this.node()?.name.split(/\s+/) ?? [];
    return `${p[0]?.[0] ?? ''}${p.at(-1)?.[0] ?? ''}`.toUpperCase();
  }
  department() {
    return (
      this.s.departments().find((d) => d.id === this.details()?.departmentId)?.name ?? 'Unassigned'
    );
  }
  manager() {
    return (
      this.s.data()?.nodes.find((n) => n.id === this.details()?.managerId)?.name ?? 'Top level'
    );
  }
  openWorkplace(w: Assignment) {
    this.close();
    void this.router.navigate(['/workplaces/floors', w.floorId, 'map'], {
      queryParams: { deskId: w.deskId },
    });
  }
}
