import { App } from './app/app';

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const app = new App(canvas, ui);
void app.boot();

// Offline support only in secure contexts and never in debug/test runs.
if ('serviceWorker' in navigator && window.isSecureContext && !location.search.includes('debug') && location.hostname !== '127.0.0.1') {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline mode unavailable; game still works online */ });
}
