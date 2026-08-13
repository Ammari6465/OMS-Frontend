import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Table, TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { OrgDataService } from '../../core/data/org-data.service';
import { Company } from '../../core/models/organization.model';
import { EntityStatus } from '../../core/models/enums';

@Component({
  selector: 'app-company-list',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    DialogModule,
    SelectModule,
    TagModule,
    TooltipModule,
    ToggleSwitchModule,
  ],
  template: `
    <div class="oms-page">
      <div class="oms-page-header">
        <div>
          <h1 class="oms-page-title">Companies</h1>
          <p class="oms-page-subtitle">Manage the companies that make up the group.</p>
        </div>
        <p-button label="New company" icon="pi pi-plus" (onClick)="openCreate()" />
      </div>

      <div class="oms-surface-card">
        <p-table
          #dt
          [value]="rows()"
          [loading]="loading()"
          [paginator]="true"
          [rows]="10"
          [rowsPerPageOptions]="[10, 25, 50]"
          [globalFilterFields]="['name', 'regNumber', 'headOffice']"
          [sortField]="'name'"
          [sortOrder]="1"
          dataKey="id"
          currentPageReportTemplate="Showing {first}–{last} of {totalRecords}"
          [showCurrentPageReport]="true"
          styleClass="p-datatable-sm oms-table"
        >
          <ng-template #caption>
            <div class="tbl-toolbar">
              <span class="p-input-icon-left search">
                <i class="pi pi-search"></i>
                <input pInputText type="text" placeholder="Search companies…"
                  (input)="dt.filterGlobal($any($event.target).value, 'contains')" />
              </span>
              <label class="archived-toggle">
                <p-toggleswitch [ngModel]="showArchived()" (ngModelChange)="toggleArchived($event)" [ngModelOptions]="{ standalone: true }" />
                Show archived
              </label>
            </div>
          </ng-template>

          <ng-template #header>
            <tr>
              <th pSortableColumn="name">Name</th>
              <th pSortableColumn="regNumber">Reg. number</th>
              <th pSortableColumn="headOffice">Head office</th>
              <th pSortableColumn="dateEstablished">Established</th>
              <th pSortableColumn="status">Status</th>
              <th style="width:7rem"></th>
            </tr>
          </ng-template>

          <ng-template #body let-c>
            <tr [class.archived-row]="c.isDeleted">
              <td><span class="cell-strong">{{ c.name }}</span></td>
              <td>{{ c.regNumber || '—' }}</td>
              <td>{{ c.headOffice || '—' }}</td>
              <td>{{ c.dateEstablished || '—' }}</td>
              <td>
                @if (c.isDeleted) {
                  <p-tag value="Archived" severity="secondary" />
                } @else {
                  <p-tag [value]="c.status === 'ACTIVE' ? 'Active' : 'Inactive'"
                    [severity]="c.status === 'ACTIVE' ? 'success' : 'warn'" />
                }
              </td>
              <td>
                <div class="row-actions">
                  @if (!c.isDeleted) {
                    <button type="button" class="icon-act" pTooltip="Edit" (click)="openEdit(c)"><i class="pi pi-pencil"></i></button>
                    <button type="button" class="icon-act danger" pTooltip="Archive" (click)="confirmDelete(c)"><i class="pi pi-trash"></i></button>
                  } @else {
                    <button type="button" class="icon-act" pTooltip="Restore" (click)="restore(c)"><i class="pi pi-refresh"></i></button>
                  }
                </div>
              </td>
            </tr>
          </ng-template>

          <ng-template #emptymessage>
            <tr>
              <td colspan="6">
                <div class="empty">
                  <i class="pi pi-building"></i>
                  <p>No companies found</p>
                  <span>Create your first company to get started.</span>
                </div>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>

      <!-- Create / edit dialog -->
      <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '32rem' }"
        [header]="editingId() ? 'Edit company' : 'New company'" [draggable]="false">
        <form [formGroup]="form" class="dlg-form" (ngSubmit)="save()">
          <div class="field">
            <label>Company name *</label>
            <input pInputText formControlName="name" class="w-full" placeholder="e.g. Sunrich Foods" />
            @if (invalid('name')) { <small class="err">Name is required.</small> }
          </div>
          <div class="grid-2">
            <div class="field">
              <label>Registration number</label>
              <input pInputText formControlName="regNumber" class="w-full" placeholder="PV-100000" />
            </div>
            <div class="field">
              <label>Established</label>
              <input pInputText type="date" formControlName="dateEstablished" class="w-full" />
            </div>
          </div>
          <div class="field">
            <label>Head office</label>
            <input pInputText formControlName="headOffice" class="w-full" placeholder="City, Country" />
          </div>
          <div class="field">
            <label>Status</label>
            <p-select formControlName="status" [options]="statusOptions" optionLabel="label" optionValue="value"
              styleClass="w-full" appendTo="body" />
          </div>
        </form>
        <ng-template #footer>
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="dialogVisible = false" />
          <p-button [label]="editingId() ? 'Save changes' : 'Create'" icon="pi pi-check" (onClick)="save()" [disabled]="saving()" />
        </ng-template>
      </p-dialog>
    </div>
  `,
  styles: [
    `
      .tbl-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
      }
      .search {
        position: relative;
      }
      .search i {
        position: absolute;
        left: 0.7rem;
        top: 50%;
        transform: translateY(-50%);
        color: var(--p-text-muted-color);
      }
      .search input {
        padding-left: 2rem;
        min-width: 16rem;
      }
      .archived-toggle {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.85rem;
        color: var(--p-text-muted-color);
      }
      .cell-strong {
        font-weight: 600;
        color: var(--p-text-color);
      }
      .archived-row {
        opacity: 0.55;
      }
      .row-actions {
        display: flex;
        gap: 0.25rem;
      }
      .icon-act {
        width: 32px;
        height: 32px;
        border: none;
        background: transparent;
        border-radius: 7px;
        cursor: pointer;
        color: var(--p-text-muted-color);
        transition: background 0.15s, color 0.15s;
      }
      .icon-act:hover {
        background: var(--p-content-hover-background, rgba(255, 255, 255, 0.05));
        color: var(--p-primary-color);
      }
      .icon-act.danger:hover {
        color: #ef4444;
      }
      .empty {
        text-align: center;
        padding: 2.5rem 1rem;
        color: var(--p-text-muted-color);
      }
      .empty i {
        font-size: 1.8rem;
        opacity: 0.5;
      }
      .empty p {
        margin: 0.6rem 0 0.2rem;
        font-weight: 600;
        color: var(--p-text-color);
      }
      .dlg-form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding-top: 0.5rem;
      }
      .grid-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }
      .field label {
        font-size: 0.82rem;
        font-weight: 500;
      }
      .err {
        color: #ef4444;
        font-size: 0.76rem;
      }
    `,
  ],
})
export class CompanyList implements OnInit {
  private readonly org = inject(OrgDataService);
  private readonly fb = inject(FormBuilder);
  private readonly confirm = inject(ConfirmationService);
  private readonly messages = inject(MessageService);

  @ViewChild('dt') table?: Table;

  readonly rows = signal<Company[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly showArchived = signal(false);
  readonly editingId = signal<number | null>(null);

  dialogVisible = false;

  readonly statusOptions = [
    { label: 'Active', value: EntityStatus.ACTIVE },
    { label: 'Inactive', value: EntityStatus.INACTIVE },
  ];

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    regNumber: [''],
    headOffice: [''],
    dateEstablished: [''],
    status: [EntityStatus.ACTIVE],
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.org.companies.list({ size: 1000, includeDeleted: this.showArchived(), sort: 'name', direction: 'asc' }).subscribe((page) => {
      this.rows.set(page.content);
      this.loading.set(false);
    });
  }

  toggleArchived(value: boolean): void {
    this.showArchived.set(value);
    this.load();
  }

  invalid(control: string): boolean {
    const c = this.form.get(control);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  openCreate(): void {
    this.editingId.set(null);
    this.form.reset({ name: '', regNumber: '', headOffice: '', dateEstablished: '', status: EntityStatus.ACTIVE });
    this.dialogVisible = true;
  }

  openEdit(c: Company): void {
    this.editingId.set(c.id);
    this.form.reset({
      name: c.name,
      regNumber: c.regNumber ?? '',
      headOffice: c.headOffice ?? '',
      dateEstablished: c.dateEstablished ?? '',
      status: c.status,
    });
    this.dialogVisible = true;
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const value = this.form.getRawValue();
    const id = this.editingId();
    const op = id
      ? this.org.companies.update(id, value)
      : this.org.companies.create(value);
    op.subscribe(() => {
      this.saving.set(false);
      this.dialogVisible = false;
      this.load();
      this.messages.add({
        severity: 'success',
        summary: id ? 'Company updated' : 'Company created',
        detail: value.name,
      });
    });
  }

  confirmDelete(c: Company): void {
    this.confirm.confirm({
      header: 'Archive company',
      message: `Archive “${c.name}”? You can restore it later.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Archive',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.org.companies.softDelete(c.id).subscribe(() => {
          this.load();
          this.messages.add({ severity: 'info', summary: 'Archived', detail: c.name });
        });
      },
    });
  }

  restore(c: Company): void {
    this.org.companies.restore(c.id).subscribe(() => {
      this.load();
      this.messages.add({ severity: 'success', summary: 'Restored', detail: c.name });
    });
  }
}
