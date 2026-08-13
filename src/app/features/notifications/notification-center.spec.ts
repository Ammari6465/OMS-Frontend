import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationCenter } from './notification-center';
import { NotificationService } from '../../core/data/notification.service';
import { AppNotification } from '../../core/models/system.model';

describe('NotificationCenter Component UI & Interactions', () => {
  let component: NotificationCenter;
  let fixture: ComponentFixture<NotificationCenter>;
  let notificationServiceMock: any;
  let routerMock: any;

  const mockNotif: AppNotification = {
    id: 101,
    type: 'VACANCY_OPENED',
    title: 'New Vacancy Created',
    message: 'Senior Full Stack Engineer position opened',
    icon: 'pi pi-briefcase',
    color: '#0f8bfd',
    category: 'VACANCY',
    priority: 'HIGH',
    isRead: false,
    link: '/vacancies',
    createdAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    notificationServiceMock = {
      unread: signal(1),
      list: vi.fn().mockReturnValue(of({ content: [mockNotif], totalElements: 1, totalPages: 1 })),
      setRead: vi.fn().mockReturnValue(of({ ...mockNotif, isRead: true })),
      markAllRead: vi.fn().mockReturnValue(of(null)),
      open: vi.fn().mockReturnValue('/vacancies'),
    };

    routerMock = { navigateByUrl: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [NotificationCenter],
      providers: [
        { provide: NotificationService, useValue: notificationServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationCenter);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('[POSITIVE] initializes and loads paginated notification list on init', () => {
    expect(notificationServiceMock.list).toHaveBeenCalledWith(expect.objectContaining({
      page: 0,
      size: 20,
      search: '',
      category: 'ALL',
      priority: 'ALL',
    }));
    expect(component.items()).toEqual([mockNotif]);
    expect(component.total()).toBe(1);
  });

  it('[POSITIVE] category, priority, and read filters update query parameters', () => {
    component.category = 'VACANCY';
    component.priority = 'HIGH';
    component.setRead('unread');

    expect(notificationServiceMock.list).toHaveBeenLastCalledWith(expect.objectContaining({
      category: 'VACANCY',
      priority: 'HIGH',
      read: false,
    }));
  });

  it('[POSITIVE] clicking notification item opens detail modal and marks item read', () => {
    component.show(mockNotif);

    expect(component.detailOpen).toBe(true);
    expect(component.selected()).toEqual(mockNotif);
    expect(notificationServiceMock.setRead).toHaveBeenCalledWith(101, true);
  });

  it('[POSITIVE] toggleRead toggles notification read state independently', () => {
    const fakeEvent = { stopPropagation: vi.fn() } as any;
    component.toggleRead(fakeEvent, mockNotif);

    expect(fakeEvent.stopPropagation).toHaveBeenCalled();
    expect(notificationServiceMock.setRead).toHaveBeenCalledWith(101, true);
  });

  it('[POSITIVE] markAll triggers markAllRead and updates item states', () => {
    component.markAll();

    expect(notificationServiceMock.markAllRead).toHaveBeenCalled();
    expect(component.items()[0].isRead).toBe(true);
  });

  it('[POSITIVE] follow navigates to related record URL and closes modal', () => {
    component.show(mockNotif);
    component.follow(mockNotif);

    expect(notificationServiceMock.open).toHaveBeenCalledWith(mockNotif);
    expect(routerMock.navigateByUrl).toHaveBeenCalledWith('/vacancies');
    expect(component.detailOpen).toBe(false);
  });
});
