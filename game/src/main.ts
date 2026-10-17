import { App } from './app/app';

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const app = new App(canvas, ui);
void app.boot();
