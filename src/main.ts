import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .then(() => {
    const loader = document.getElementById('oms-bootstrap-loader');
    if (!loader) return;

    // Reveal the first routed view only after it has had a chance to paint.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        loader.classList.add('is-leaving');
        window.setTimeout(() => loader.remove(), 450);
      });
    });
  })
  .catch((err) => {
    console.error(err);
    const label = document.querySelector<HTMLElement>('.oms-boot__label');
    if (label) label.textContent = 'Unable to start OMS. Please reload and try again.';
  });
