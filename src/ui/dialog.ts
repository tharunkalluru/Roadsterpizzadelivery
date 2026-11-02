// Keep modal navigation inside its visible surface, including keyboard focus.
// aria-modal describes the dialog; inert also prevents clicks and focus behind it.
// Completion, pause and map dialogs may overlap for a frame and close out of
// order. Share isolation ownership instead of snapshotting another dialog's
// temporary `true`, which would leave the game inert after both dialogs close.
const isolation = new WeakMap<HTMLElement, { original: boolean; owners: Set<DialogFocus> }>();
function isolate(element: HTMLElement, owner: DialogFocus) {
  let state = isolation.get(element);
  if (!state) { state = { original: element.inert, owners: new Set() }; isolation.set(element, state); }
  state.owners.add(owner); element.inert = true;
}
function release(element: HTMLElement, owner: DialogFocus) {
  const state = isolation.get(element);
  if (!state?.owners.delete(owner)) return;
  if (state.owners.size) element.inert = true;
  else { element.inert = state.original; isolation.delete(element); }
}
export class DialogFocus {
  private active = false;
  private previous: HTMLElement | null = null;
  private isolated: HTMLElement[] = [];
  constructor(private root: HTMLElement, private options: {
    initial?: () => HTMLElement | null;
    restore?: () => HTMLElement | null;
    key?: (event: KeyboardEvent) => void;
    captureKeys?: boolean;
  } = {}) {}

  private targets() {
    return [...this.root.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex]')]
      .filter((el) => el.tabIndex >= 0 && !el.matches(':disabled') && !el.closest('[hidden],[inert]') && el.getClientRects().length > 0);
  }
  private focusInitial() {
    const preferred = this.options.initial?.();
    (preferred && !preferred.closest('[hidden],[inert]') ? preferred : this.targets()[0] || this.root).focus({ preventScroll: true });
  }
  private focus = (event: FocusEvent) => {
    if (this.active && !this.root.contains(event.target as Node)) this.focusInitial();
  };
  private key = (event: KeyboardEvent) => {
    if (!this.active) return;
    if (event.key === 'Tab') {
      const targets = this.targets(), current = targets.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? (current <= 0 ? targets.length - 1 : current - 1) : (current + 1) % targets.length;
      event.preventDefault(); event.stopPropagation();
      (targets[next] || this.root).focus({ preventScroll: true });
      return;
    }
    this.options.key?.(event);
    // Map shortcuts belong to the map; Enter and Space retain native button activation.
    if (this.options.captureKeys) event.stopPropagation();
  };
  show() {
    if (!this.active) {
      this.previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      let branch: HTMLElement = this.root;
      while (branch.parentElement) {
        for (const sibling of branch.parentElement.children) {
          if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
          this.isolated.push(sibling); isolate(sibling, this);
        }
        if (branch.parentElement === document.body) break;
        branch = branch.parentElement;
      }
      this.active = true;
      this.root.tabIndex = -1;
      document.addEventListener('focusin', this.focus, true);
      document.addEventListener('keydown', this.key);
    }
    this.focusInitial();
  }
  hide() {
    if (!this.active) return;
    this.active = false;
    document.removeEventListener('focusin', this.focus, true);
    document.removeEventListener('keydown', this.key);
    for (const element of this.isolated) release(element, this);
    this.isolated = [];
    const previous = this.previous; this.previous = null;
    const available = (el: HTMLElement | null | undefined) => el?.isConnected && el.tabIndex >= 0 && !el.closest('[hidden],[inert]') && el.getClientRects().length > 0;
    const target = available(previous) ? previous : this.options.restore?.();
    if (available(target)) target!.focus({ preventScroll: true });
  }
}
