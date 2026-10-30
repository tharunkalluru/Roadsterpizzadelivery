import { DialogFocus } from '../../ui/dialog';
import { restaurantArt, RestaurantOpening } from './restaurant';
import { callButtonLayout, actionBlockLayout, type CallButtonRect } from './call-button-layout';
import { callTimer, portraitUrl, type DeliveryPortrait, type DeliveryUIActions, type DeliveryView } from './view-model';
export type { DeliveryUIActions, DeliveryView } from './view-model';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const phoneIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3 4 5c-2 3 8 16 13 14l3-3-5-4-2 2-4-5 2-2z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></svg>';
const pizzaIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a16 16 0 0 1 16 0L12 21Z" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/><path d="M5.5 8a13 13 0 0 1 13 0" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="10" cy="11" r="1.3" fill="currentColor"/><circle cx="14" cy="13" r="1.3" fill="currentColor"/></svg>';
const silhouette = '<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="43" r="24" fill="#9683A7"/><path d="M19 111v-9a41 41 0 0 1 82 0v9" fill="#9683A7"/><text x="60" y="60" text-anchor="middle" font-family="Arial,sans-serif" font-size="38" font-weight="bold" fill="#271936">?</text></svg>';

export const DELIVERY_UI_CSS = `
.delivery-ui{position:absolute;inset:0;pointer-events:none;color:#FFF1D8;font-family:var(--body,system-ui,sans-serif);z-index:7}
.delivery-ui[hidden],.delivery-ui [hidden]{display:none!important}
.delivery-ui button{touch-action:manipulation;pointer-events:auto;cursor:pointer;min-height:44px;color:#FFF1D8;font-family:var(--display,system-ui,sans-serif);border:2px solid #8B6BA6;border-radius:16px;padding:8px 14px;box-sizing:border-box;box-shadow:0 3px 0 #130D20;background:#271936}
#hud .delivery-ui button{background-color:#271936!important;background-image:none!important;filter:none!important;backdrop-filter:none!important;opacity:1!important}
#hud .delivery-ui .du-primary{background-color:#FFBF00!important;color:#21152F!important;border-color:#FFF0BE}
#hud .delivery-ui .du-teal{background-color:#20E8D0!important;color:#21152F!important;border-color:#9AFFEC}
#hud .delivery-ui .du-danger{background-color:#642B4B!important;color:#FFF1D8!important;border-color:#B6648A}
.delivery-ui button:disabled{color:#B0A0C2!important;border-color:#574363;cursor:default;box-shadow:none}
.delivery-ui button:focus-visible{outline:3px solid #20E8D0;outline-offset:3px}
.delivery-ui svg{display:block;pointer-events:none}
.du-actions{position:absolute;right:24px;bottom:90px;display:flex;flex-direction:column;gap:7px;width:170px;pointer-events:none}
.du-actions button{width:100%;font-size:13px;display:flex;align-items:center;justify-content:center;gap:8px}
.du-actions svg{width:23px;height:23px;flex-shrink:0}
/* Only contextual guidance uses a light translucent surface. Full-screen
   dialogs remain opaque for the proven Samsung rendering treatment. */
#hud .delivery-ui button.du-call{position:absolute;left:50%;top:60%;width:156px;height:48px;min-width:44px;min-height:44px;border-radius:16px;padding:5px 9px;display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid rgba(160,255,236,.7);background-color:rgba(17,66,63,.76)!important;background-image:linear-gradient(145deg,rgba(255,255,255,.14),rgba(255,255,255,0) 66%)!important;color:#FFF9EA!important;box-shadow:inset 0 1px 0 rgba(207,255,243,.45),0 2px 0 #171125;text-shadow:none}
.du-call svg{width:23px;height:23px;flex-shrink:0;transform-origin:center}
.du-call-copy{display:flex;flex-direction:column;gap:1px;min-width:0;text-align:left;font:800 11px/1.2 var(--body,system-ui)}
.du-call-copy small{font:600 10px/1.15 var(--body,system-ui);color:#B5FFF0}
#hud .delivery-ui button.du-call[data-compact=true]{padding:4px;border-radius:12px;gap:0}
.du-call[data-compact=true] svg,.du-call[data-compact=true] small{display:none}
.du-call[data-compact=true] .du-call-copy{text-align:center;font-size:10px;line-height:1.15;overflow-wrap:normal}
.du-call[data-state=enabled] svg{animation:du-call-ready 1.5s ease-in-out 2}
.du-call[data-state=ringing] svg{animation:du-call-ring .9s ease-in-out infinite}
.du-call[data-state=ringing]{animation:du-call-attention 1.2s ease-in-out infinite}
#hud.has-modal .delivery-ui>.du-call,#hud.has-modal .delivery-ui>.du-actions,#hud.has-modal .delivery-ui>.du-notice{display:none!important}
.du-action-hint{margin:0;padding:6px 9px;border-radius:9px;background-color:#271936!important;color:#FFF1D8;font-size:11px;line-height:1.2;text-align:center}
.du-notice{box-sizing:border-box;position:fixed;left:var(--hud-notice-left,18px);top:var(--hud-notice-top,105px);width:var(--hud-notice-width,180px);height:var(--hud-notice-height,48px);margin:0;border-radius:10px;background-color:#271936!important;border:1px solid #8B6BA6;padding:6px 8px;font-size:11px;font-weight:700;line-height:14px;text-align:left;overflow:hidden;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}
.du-overlay{position:absolute;inset:0;padding:max(12px,env(safe-area-inset-top,0px)) max(12px,env(safe-area-inset-right,0px)) max(12px,env(safe-area-inset-bottom,0px)) max(12px,env(safe-area-inset-left,0px));display:grid;place-items:center;background-color:#171125!important;pointer-events:auto;box-sizing:border-box;z-index:15;touch-action:pan-y}
.du-sheet{box-sizing:border-box;width:min(720px,100%);max-height:100%;overflow:auto;overscroll-behavior:contain;background-color:#271936!important;border:2px solid #8B6BA6;border-radius:24px;padding:20px;box-shadow:0 5px 0 #100A18}
.du-phone{display:grid;grid-template-columns:170px 1fr;gap:18px;max-width:650px;border-color:#20E8D0}
.du-caller{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px}
.du-avatar{width:104px;height:104px;border-radius:50%;border:3px solid #8B6BA6;background:#21152F;overflow:hidden;flex-shrink:0}
.du-avatar img,.du-avatar svg{width:100%;height:100%;object-fit:cover;display:block}
.du-caller-name{font-family:var(--display,system-ui);font-size:15px;line-height:1.25;margin:0;overflow-wrap:anywhere}
.du-phone-time{font-variant-numeric:tabular-nums;color:#20E8D0;font-size:14px}
.du-dialogue{display:flex;flex-direction:column;min-width:0;justify-content:center;gap:10px}
.du-speaker{font-size:11px;color:#FFBF00;text-transform:uppercase;font-weight:800;letter-spacing:.05em}
.du-line{font-size:clamp(17px,2.4vw,23px);line-height:1.35;margin:0;min-height:2.7em}
.du-replies{display:flex;gap:7px;flex-wrap:wrap}.du-replies button{font-family:var(--body,system-ui);font-size:14px;flex:1;min-width:100px;font-weight:800;text-align:left}
.du-call-footer{display:flex;gap:8px;align-items:center;margin-top:3px}.du-call-footer button{flex:1;font-size:11px}.du-next{min-width:110px}
.du-eyebrow{font-size:11px;font-weight:800;letter-spacing:.08em;color:#FFBF00;text-transform:uppercase;margin:0 0 7px}
.du-completion{display:grid;grid-template-columns:minmax(150px,.8fr) minmax(200px,1.2fr);gap:20px;border-color:#FFBF00}
.du-completion h2,.du-collection h2{font-family:var(--display,system-ui);font-size:clamp(20px,3vw,28px);font-weight:400;margin:0 0 8px;line-height:1.15}
.du-completion .du-avatar{width:108px;height:108px;margin:0 0 10px}.du-movie{color:#CBB8DC;font-size:14px;margin:0 0 10px}
.du-restaurant>svg{width:100%;max-height:220px}.du-restaurant-label{font-weight:800;color:#20E8D0;margin:4px 0 12px;text-align:center;font-size:15px}
.du-complete-actions{display:flex;gap:8px;flex-wrap:wrap}.du-complete-actions button{flex:1;font-size:12px;min-width:130px}
.du-collection-header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.du-collection-header button{font-size:12px}
.du-collection-content{display:grid;grid-template-columns:220px 1fr;gap:16px}.du-collected{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-content:start}.du-customer-card{padding:10px;border:1px solid #77558E;border-radius:15px;background:#21152F}.du-customer-card .du-avatar{width:58px;height:58px;margin-bottom:6px}.du-customer-card strong{font-size:13px;display:block}.du-customer-card small{display:block;font-size:11px;color:#CBB8DC}.du-empty{grid-column:1 / -1;font-size:14px;color:#CBB8DC}
.du-grand-opening{background-color:#21152F!important;border:2px solid #785D91;border-radius:18px;padding:8px;text-align:center}
.du-grand-opening[data-opening=open]{border-color:#45E3D3}
.du-completion[data-final=true] .du-complete-actions button{min-width:0;font-size:11px;padding:6px 8px}
.du-opening-caption{font-size:12px;font-weight:800;line-height:1.25;margin:4px 0;color:#FFF1D8}
.delivery-ui .du-opening-skip{min-height:44px;padding:5px 12px;font-size:10px;margin-top:3px}
.du-restaurant .du-opening-door-left{transform:translateX(-20px)}.du-restaurant .du-opening-door-right{transform:translateX(20px)}
.du-grand-opening .du-opening-door-left,.du-grand-opening .du-opening-door-right{transition:transform .65s ease-out}
.du-grand-opening[data-opening=closed] .du-opening-door-left,.du-grand-opening[data-opening=closed] .du-opening-door-right,.du-grand-opening[data-opening=lights] .du-opening-door-left,.du-grand-opening[data-opening=lights] .du-opening-door-right{transform:translateX(0)}
.du-grand-opening[data-opening=closed] .du-opening-window{fill:#432F50}.du-grand-opening[data-opening=closed] .du-opening-oven{fill:#81543C}
.du-grand-opening:not([data-opening=open]) .du-opening-neon-frame{stroke:#604D6E}.du-grand-opening:not([data-opening=open]) .du-opening-neon-text{fill:#9683A7}.du-grand-opening:not([data-opening=open]) .du-opening-rays{stroke:#432F50}
@media(prefers-reduced-motion:reduce){.du-grand-opening .du-opening-door-left,.du-grand-opening .du-opening-door-right{transition:none}}
@keyframes du-call-ready{50%{transform:scale(1.14)}}
@keyframes du-call-attention{50%{border-color:#D2FFF4;box-shadow:inset 0 1px 0 rgba(207,255,243,.45),0 0 0 3px rgba(32,232,208,.2)}}
@keyframes du-call-ring{0%,50%,100%{transform:rotate(0)}15%{transform:rotate(-16deg)}30%{transform:rotate(16deg)}}
@media(max-height:520px){.du-sheet{padding:14px;border-radius:20px}.du-phone{grid-template-columns:130px 1fr;gap:14px}.du-avatar{width:80px;height:80px}.du-caller-name{font-size:13px}.du-line{font-size:17px}.du-completion{gap:14px}.du-completion .du-avatar{width:76px;height:76px}.du-restaurant>svg{max-height:150px}.du-grand-opening .du-restaurant>svg{max-height:120px}.du-restaurant-label{font-size:12px;margin:3px 0 7px}.du-completion h2{font-size:21px}.du-collection-content{grid-template-columns:170px 1fr}.du-actions button{min-height:44px;font-size:11px;padding:6px 9px}.du-action-hint{font-size:10px}}
@media(max-width:600px){.du-phone{grid-template-columns:90px 1fr;gap:10px}.du-avatar{width:65px;height:65px}.du-caller-name{font-size:11px}.du-line{font-size:15px}.du-call-footer button{padding:5px 7px;font-size:10px}.du-completion{grid-template-columns:1fr 1fr;gap:10px}.du-collection-content{grid-template-columns:1fr}.du-collection-content>.du-restaurant{display:none}}
@media(prefers-reduced-motion:reduce){.du-call[data-state=enabled] svg,.du-call[data-state=ringing] svg,.du-call[data-state=ringing]{animation:none}}
`;

/** Plain opaque DOM overlay; gameplay owns physics and the pause boundary. */
export class DeliveryUI {
  readonly root: HTMLElement;
  private model: DeliveryView | null = null;
  private callback: DeliveryUIActions;
  private elements: Record<string, HTMLElement> = {};
  private collectionShown = false;
  private currentDialog = '';
  private dialogFocus: DialogFocus;
  private lineKey = '';
  private completionKey = '';
  private opening: RestaurantOpening | null = null;
  private collectionKey = '';
  private resize: ResizeObserver | null = null;
  private layoutDirty = true;
  private layoutTimer = 0;
  private layoutKey = '';
  private keyboardMode = false;
  private noticeActive = false;
  private hostLayoutHandler = () => this.onHostLayout();
  private keyHandler: (event: KeyboardEvent) => void;

  constructor(private host: HTMLElement, actions: DeliveryUIActions) {
    this.callback = actions;
    if (!document.getElementById('delivery-story-style')) {
      const style = document.createElement('style'); style.id = 'delivery-story-style'; style.textContent = DELIVERY_UI_CSS; document.head.append(style);
    }
    this.root = document.createElement('section'); this.root.className = 'delivery-ui'; this.root.setAttribute('aria-label', 'Pizza delivery');
    this.root.innerHTML = `<button class="du-call" data-du="call" type="button" aria-label="Call customer" title="Call customer" hidden>${phoneIcon}<span class="du-call-copy"><span data-du="call-label">Call customer</span><small data-du="call-hint">Tap to call</small></span></button>
      <div class="du-actions" data-du="actions"><button class="du-primary" data-du="drop" hidden>${pizzaIcon}<span data-du="drop-label">Drop</span></button><p class="du-action-hint" data-du="hint" hidden></p></div>
      <div class="du-notice" data-du="notice" role="status" hidden></div>
      <div class="du-overlay" data-du="overlay" role="dialog" aria-modal="true" aria-label="Delivery conversation" hidden>
        <section class="du-sheet du-phone" data-du="phone" hidden><div class="du-caller"><div class="du-avatar" data-du="caller-avatar">${silhouette}</div><h2 class="du-caller-name" data-du="caller-name">Unknown Customer</h2><span class="du-phone-time" data-du="timer">00:00</span></div><div class="du-dialogue"><div class="du-speaker" data-du="speaker"></div><p class="du-line" data-du="line" aria-live="polite"></p><div class="du-replies" data-du="replies"></div><div class="du-call-footer"><button class="du-teal du-next" data-du="next">Next line</button><button class="du-danger" data-du="end">End call</button></div></div></section>
        <section class="du-sheet du-completion" data-du="completion" hidden></section>
        <section class="du-sheet du-collection" data-du="collection" hidden><header class="du-collection-header"><h2>My restaurant</h2><button data-du="collection-close">Back to city</button></header><div class="du-collection-content" data-du="collection-content"></div><a href="/delivery/celebrities/credits.html" target="_blank" rel="noopener" style="display:inline-block;margin-top:12px;color:#CBB8DC;font-size:11px;pointer-events:auto">Photo credits</a></section>
      </div>`;
    this.root.querySelectorAll<HTMLElement>('[data-du]').forEach(el => this.elements[el.dataset.du!] = el);
    host.append(this.root);
    this.dialogFocus = new DialogFocus(this.elements.overlay, { captureKeys: true, key: event => {
      if (event.code === 'Escape') { event.preventDefault(); if (this.collectionShown) this.closeCollection(); }
    } });
    const on = (name: string, fn: () => void) => this.elements[name].addEventListener('click', event => { event.stopPropagation(); fn(); });
    on('call', () => this.callback.call()); on('drop', () => this.callback.drop());
    on('next', () => this.callback.advanceCall()); on('end', () => this.callback.endCall());
    on('collection-close', () => this.closeCollection());
    this.root.addEventListener('pointerdown', event => { this.keyboardMode = false; if ((event.target as Element).closest('button,.du-overlay')) event.stopPropagation(); });
    this.root.addEventListener('contextmenu', event => event.preventDefault());
    this.keyHandler = event => {
      this.keyboardMode = true;
      if (this.root.hidden || this.blocking || ['has-modal','title-open','area-picker-open','has-tip','rotation-blocked'].some(name=>this.host.classList.contains(name)) || event.repeat || event.ctrlKey || event.metaKey || event.altKey || document.hidden) return;
      if ((event.target as Element | null)?.closest('input,textarea,select')) return;
      if (event.code === 'KeyC' && this.model && ['enabled', 'ringing'].includes(this.model.call.state)) { event.preventDefault(); this.callback.call(); }
      if (event.code === 'KeyE' && this.model?.action?.enabled) { event.preventDefault(); this.callback.drop(); }
    };
    document.addEventListener('keydown', this.keyHandler);
    host.addEventListener('hudlayoutchange', this.hostLayoutHandler);
    if (typeof ResizeObserver !== 'undefined') { this.resize = new ResizeObserver(() => this.layoutDirty = true); this.resize.observe(host); }
  }

  get blocking() { return !this.root.hidden && (this.collectionShown || !!this.model?.phone || !!this.model?.completion); }
  get collectionOpen() { return this.collectionShown; }
  setVisible(visible: boolean) {
    if (this.root.hidden === !visible) return;
    this.root.hidden = !visible; this.layoutDirty = true;
    this.syncNoticePriority();
    if (!visible) this.opening?.finish();
    if (!visible) this.dialogFocus.hide(); else { this.syncDialog(); if (this.currentDialog) this.dialogFocus.show(); }
  }

  update(model: DeliveryView) {
    this.model = model; const el = this.elements;
    const call = el.call as HTMLButtonElement;
    const callable = model.call.state === 'enabled' || model.call.state === 'ringing';
    this.hide(call, !callable || this.collectionShown || !!model.phone || !!model.completion);
    if (call.disabled !== !callable) call.disabled = !callable;
    if (call.dataset.state !== model.call.state) call.dataset.state = model.call.state;
    const callLabel = model.call.state === 'ringing' ? 'Incoming call. Tap to answer' : 'Call customer';
    this.text('call-label', model.call.state === 'ringing' ? 'Incoming call' : 'Call customer');
    this.text('call-hint', model.call.state === 'ringing' ? 'Tap to answer' : 'Tap to call');
    if (call.getAttribute('aria-label') !== callLabel) { call.setAttribute('aria-label', callLabel); call.title = callLabel; }
    const action = el.drop as HTMLButtonElement;
    this.hide(action, !model.action || this.collectionShown || !!model.phone || !!model.completion);
    if (action.disabled !== !model.action?.enabled) action.disabled = !model.action?.enabled;
    this.text('drop-label', model.action?.label || 'Drop');
    this.hide(el.hint, !model.action?.hint || action.hidden); this.text('hint', model.action?.hint || '');
    this.syncNoticePriority(); this.text('notice', model.notice || '');
    if (model.phone) this.updatePhone(model);
    if (model.completion) this.updateCompletion(model);
    else if (this.opening) { this.opening.dispose(); this.opening = null; this.completionKey = ''; }
    if (this.collectionShown) this.updateCollection(model);
    this.syncDialog();
    const layoutKey = `${call.hidden}:${action.hidden}:${el.hint.hidden}:${!!model.nav}:${model.action?.hint || ''}`;
    if (layoutKey !== this.layoutKey) { this.layoutKey = layoutKey; this.layoutDirty = true; }
    // Measurements are throttled and only made after layout-affecting changes.
    const now = performance.now();
    if (this.layoutDirty || now - this.layoutTimer > 1000) { this.layout(); this.layoutTimer = now; this.layoutDirty = false; }
  }

  private text(name: string, value: string) { if (this.elements[name].textContent !== value) this.elements[name].textContent = value; }
  private hide(element: HTMLElement, hidden: boolean) { if (element.hidden !== hidden) element.hidden = hidden; }
  private syncNoticePriority() {
    const active = !this.root.hidden && !this.blocking && !!this.model?.notice?.trim();
    this.hide(this.elements.notice, !active);
    if (this.noticeActive !== active) {
      this.host.classList.toggle('has-delivery-notice', active);
      this.noticeActive = active;
    }
  }
  private onHostLayout() {
    this.layoutDirty = true;
    if (this.root.hidden) return;
    this.layout(); this.layoutTimer = performance.now(); this.layoutDirty = false;
  }
  private avatar(element: HTMLElement, name: string, image?: string, revealed = true) {
    element.replaceChildren();
    const url = revealed ? portraitUrl(image) : '';
    if (url) {
      const img = document.createElement('img'); img.src = url; img.alt = name; img.decoding = 'async';
      img.onerror = () => { img.remove(); element.innerHTML = silhouette; }; element.append(img);
    } else element.innerHTML = silhouette;
  }
  private updatePhone(model: DeliveryView) {
    const phone = model.phone!, name = phone.revealed && phone.name ? phone.name : 'Unknown Customer';
    this.text('timer', callTimer(phone.elapsed));
    const key = JSON.stringify([phone.revealed, name, phone.image, phone.who, phone.text, phone.replies, phone.canAdvance]);
    if (key === this.lineKey) return; this.lineKey = key;
    // Only a keyboard user's currently focused script control follows the next
    // line. Pointer taps, the timer and unrelated controls must not steal focus.
    const active = document.activeElement;
    const followFocus = this.keyboardMode && !this.root.hidden && this.currentDialog === 'phone' &&
      (active === this.elements.next || this.elements.replies.contains(active));
    this.avatar(this.elements['caller-avatar'], name, phone.image, phone.revealed);
    this.text('caller-name', name); this.text('speaker', phone.who === 'player' ? 'You' : name);
    this.text('line', phone.text); this.elements.replies.replaceChildren();
    for (const [index, reply] of (phone.replies || []).slice(0, 2).entries()) {
      const button = document.createElement('button'); button.textContent = reply;
      button.addEventListener('click', event => { event.stopPropagation(); this.callback.advanceCall(index); }); this.elements.replies.append(button);
    }
    this.hide(this.elements.next, !!phone.replies?.length || phone.canAdvance === false);
    if (followFocus) {
      const next = this.elements.replies.querySelector<HTMLButtonElement>('button') ??
        (this.elements.next.hidden ? this.elements.end : this.elements.next);
      next.focus({ preventScroll: true });
    }
  }
  private updateCompletion(model: DeliveryView) {
    const card = model.completion!;
    const key = JSON.stringify([card, model.restaurantStage, model.total]);
    if (key === this.completionKey) return; this.completionKey = key;
    this.opening?.dispose(); this.opening = null;
    this.elements.completion.dataset.final = card.final ? 'true' : 'false';
    this.elements.completion.innerHTML = `<div><p class="du-eyebrow">${card.final ? 'Dream delivered' : 'Delivery complete'}</p><div class="du-avatar" data-portrait></div><h2>${esc(card.name)}</h2><p class="du-movie">${esc(card.movie)}</p><p class="du-eyebrow">${card.final ? 'Grand opening' : `Level ${model.level} / ${model.total}`}</p></div><div>${card.final ? '<div class="du-grand-opening" data-opening="closed">' : ''}<div class="du-restaurant">${restaurantArt(model.restaurantStage, model.total, card.restaurantLabel)}</div>${card.final ? '<p class="du-opening-caption" data-opening-caption role="status">Your dream, one delivery at a time.</p><button class="du-opening-skip" data-skip-opening>Skip opening</button></div>' : ''}<p class="du-restaurant-label">${esc(card.restaurantLabel)}</p><div class="du-complete-actions"><button class="du-primary" data-continue>${card.final ? 'Explore Hyderabad' : 'Next delivery'}</button>${card.bonusAvailable ? '<button data-bonus>One more call</button>' : ''}</div></div>`;
    this.avatar(this.elements.completion.querySelector('[data-portrait]')!, card.name, card.image);
    this.elements.completion.querySelector('[data-continue]')!.addEventListener('click', () => { this.opening?.dispose(); this.callback.continue(); });
    this.elements.completion.querySelector('[data-bonus]')?.addEventListener('click', () => { this.opening?.finish(); this.callback.bonusCall?.(); });
    if (card.final) {
      const sheet = this.elements.completion, scene = sheet.querySelector<HTMLElement>('[data-opening]')!;
      const caption = sheet.querySelector<HTMLElement>('[data-opening-caption]')!, skip = sheet.querySelector<HTMLButtonElement>('[data-skip-opening]')!;
      this.opening = new RestaurantOpening(phase => {
        scene.dataset.opening = phase;
        caption.textContent = phase === 'closed' ? 'Your dream, one delivery at a time.' : phase === 'lights' ? 'Lights on. The oven is ready.' : phase === 'doors' ? 'Doors open. Hyderabad, come in!' : 'Welcome to Roadster Pizza!';
        const followFocus = document.activeElement === skip;
        skip.hidden = phase === 'open';
        if (followFocus && skip.hidden) sheet.querySelector<HTMLButtonElement>('[data-continue]')?.focus({ preventScroll: true });
      });
      skip.addEventListener('click', () => this.opening?.finish());
      this.opening.start(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
  }
  private updateCollection(model: DeliveryView) {
    const key = JSON.stringify([model.collection, model.restaurantStage, model.total, model.restaurantLabel]);
    if (key === this.collectionKey) return; this.collectionKey = key;
    const content = this.elements['collection-content'];
    content.innerHTML = `<div class="du-restaurant">${restaurantArt(model.restaurantStage, model.total, model.restaurantLabel)}<p class="du-restaurant-label">${esc(model.restaurantLabel)}</p></div><div class="du-collected">${model.collection.length ? '' : '<p class="du-empty">Your first customer is waiting. Jump through a glowing pizza slice above traffic to begin.</p>'}</div>`;
    const list = content.querySelector('.du-collected')!;
    for (const customer of model.collection) {
      const card = document.createElement('article'); card.className = 'du-customer-card';
      card.innerHTML = `<div class="du-avatar"></div><strong>${esc(customer.name)}</strong><small>${esc(customer.movie)}</small>`;
      this.avatar(card.querySelector('.du-avatar')!, customer.name, customer.image); list.append(card);
    }
  }
  openCollection() {
    if (!this.model || this.model.phone || this.model.completion || this.collectionShown) return;
    this.collectionShown = true; this.callback.collectionOpen?.(); this.updateCollection(this.model); this.syncDialog();
  }
  closeCollection() {
    if (!this.collectionShown) return;
    this.collectionShown = false; this.syncDialog(); this.callback.collectionClose?.();
  }
  private syncDialog() {
    const next = this.model?.phone ? 'phone' : this.model?.completion ? 'completion' : this.collectionShown ? 'collection' : '';
    const el = this.elements;
    const callable = this.model?.call.state === 'enabled' || this.model?.call.state === 'ringing';
    this.hide(el.call, !!next || !callable);
    this.hide(el.drop, !!next || !this.model?.action);
    this.hide(el.hint, !!next || !this.model?.action?.hint || el.drop.hidden);
    if (next !== 'completion') this.opening?.finish();
    for (const name of ['phone', 'completion', 'collection']) this.hide(el[name], next !== name);
    this.hide(el.overlay, !next);
    this.syncNoticePriority();
    if (this.root.dataset.dialog !== next) this.root.dataset.dialog = next;
    if (next !== this.currentDialog) {
      el.overlay.setAttribute('aria-label', next === 'phone' ? 'Phone call' : next === 'completion' ? 'Delivery complete' : 'My restaurant');
      this.dialogFocus.hide(); this.currentDialog = next;
      if (next && !this.root.hidden) this.dialogFocus.show();
      if (!next) this.lineKey = '';
    }
  }
  private layout() {
    const touch = !!this.host.closest('.is-touch');
    const actions = this.elements.actions, jump = this.host.querySelector<HTMLElement>('#t-jump');
    const host = this.host.getBoundingClientRect();
    const measured = (element: HTMLElement | null): CallButtonRect | null => {
      if (!element || element.hidden || !element.getClientRects().length) return null;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      return { left: rect.left - host.left, top: rect.top - host.top, width: rect.width, height: rect.height };
    };
    const anchor = touch ? measured(jump) : null;
    const obstacles: CallButtonRect[] = [];
    for (const element of this.host.querySelectorAll<HTMLElement>('#minimap,.touch button,.btnrow button,.h-tc,.wallet,#orders-toggle,#flight-navigation,#hud-navigation-slot,#hud-notice-slot,.speed,#area-chip,#rescue,#t-act,.du-notice')) {
      const rect = measured(element); if (rect) obstacles.push(rect);
    }
    // Reserve the host-owned notice lane even between messages, so phone and
    // delivery actions do not move into it immediately before a notice arrives.
    // The opacity-hidden area chip above it intentionally remains an obstacle.
    if (this.host.dataset?.noticeSpace !== 'false' && !measured(this.host.querySelector('#hud-notice-slot'))) {
      const hostStyle = typeof getComputedStyle === 'function' ? getComputedStyle(this.host) : null;
      const noticeValue = (name: string, fallback: number) => {
        const value = Number.parseFloat(hostStyle?.getPropertyValue(`--hud-notice-${name}`) || '');
        return Number.isFinite(value) ? value : fallback;
      };
      obstacles.push({ left: noticeValue('left', 18), top: noticeValue('top', 105), width: noticeValue('width', 180), height: noticeValue('height', 48) });
    }
    const insets = this.host.querySelector<HTMLElement>('#hud-insets');
    const padding = insets && typeof getComputedStyle === 'function' ? getComputedStyle(insets) : null;
    const left = Math.max(12, parseFloat(padding?.paddingLeft || '') || 0);
    const top = Math.max(12, parseFloat(padding?.paddingTop || '') || 0);
    const right = Math.max(12, parseFloat(padding?.paddingRight || '') || 0);
    const bottom = Math.max(12, parseFloat(padding?.paddingBottom || '') || 0);
    const bounds = { left, top, width: host.width - left - right, height: host.height - top - bottom };
    // The host reserves this center lane for calls even when no call is active,
    // so notices and delivery actions never have to cover it on arrival.
    let callSlot=measured(this.host.querySelector<HTMLElement>('#hud-call-slot'));
    if(!callSlot&&touch){
      const steer=measured(this.host.querySelector<HTMLElement>('#t-right'));
      if(steer&&anchor){
        const laneLeft=steer.left+steer.width+8,laneRight=anchor.left-8,height=44;
        for(const width of [156,136,128,112,96,80,60]){
          const x=(host.width-width)/2;
          if(x>=laneLeft&&x+width<=laneRight){callSlot={left:x,top:steer.top+(steer.height-height)/2,width,height};break;}
        }
        if(!callSlot&&laneRight-laneLeft>=60)callSlot={left:laneLeft,top:steer.top+(steer.height-height)/2,width:Math.min(156,laneRight-laneLeft),height};
      }
    }
    const call = this.elements.call;
    const placement = call.hidden ? null : callButtonLayout(bounds,obstacles,callSlot||undefined);
    call.style.visibility=call.hidden||placement?'':'hidden';
    if(placement){
      Object.assign(call.style,{left:`${placement.left}px`,top:`${placement.top}px`,width:`${placement.width}px`,height:`${placement.height}px`,right:'auto',bottom:'auto'});
      call.dataset.compact=String(placement.width<112);
    }
    const actionObstacles=[...obstacles];
    if(callSlot)actionObstacles.push(callSlot);
    if(placement)actionObstacles.push(placement);
    if (!this.elements.drop.hidden) {
      // Place the complete block, including its wrapped instruction. The call
      // slot has priority and remains clear before a call becomes actionable.
      actions.style.width = `${anchor ? Math.max(100, Math.round(anchor.width)) : 170}px`;
      this.elements.hint.style.display = '';
      let actionRect = measured(actions);
      let actionPlacement = actionBlockLayout(bounds, actionObstacles, { width: actionRect?.width || 170, height: Math.max(44, actionRect?.height || 44) }, anchor || undefined);
      if (!actionPlacement) {
        this.elements.hint.style.display = 'none'; actionRect = measured(actions);
        actionPlacement = actionBlockLayout(bounds, actionObstacles, { width: actionRect?.width || 170, height: Math.max(44, actionRect?.height || 44) }, anchor || undefined);
      }
      actions.style.visibility = actionPlacement ? '' : 'hidden';
      if (actionPlacement) Object.assign(actions.style, { left: `${actionPlacement.left}px`, top: `${actionPlacement.top}px`, right: 'auto', bottom: 'auto' });
    } else {
      actions.style.visibility = ''; actions.style.left = ''; actions.style.width = ''; actions.style.top = ''; actions.style.right = ''; actions.style.bottom = '';
      this.elements.hint.style.display = '';
    }
  }
  dispose() {
    this.host.removeEventListener('hudlayoutchange', this.hostLayoutHandler);
    this.host.classList.remove('has-delivery-notice');
    this.opening?.dispose(); this.opening = null;
    this.dialogFocus.hide(); this.resize?.disconnect(); document.removeEventListener('keydown', this.keyHandler); this.root.remove();
  }
}
