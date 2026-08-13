import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { CommandPalette } from './layout/command-palette/command-palette';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastModule, ConfirmDialogModule, CommandPalette],
  template: `
    <p-toast position="top-right" />
    <p-confirmdialog />
    <app-command-palette />
    <router-outlet />
  `,
})
export class App {}
