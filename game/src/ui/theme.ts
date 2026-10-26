// Shared chrome for the approved plum-and-neon interface. World rendering stays separate.
export const PROTOTYPE_THEME_CSS = `
:root{--ink:#171125;--panel:rgba(25,16,43,.96);--line:#5C427D;--cream:#FFF9EA;--muted:#D3C8E8;--saffron:#FFBF00;--teal:#20F2D5;--heat:#FF8A24;--pink:#FF4FAE;--success:#30ED78;--ui-plum:linear-gradient(155deg,rgba(54,33,78,.98),rgba(24,15,41,.97) 65%);--ui-rim:#B98CEB;--ui-panel-shadow:inset 0 1px 0 rgba(255,249,234,.15),0 3px 0 #130D20,0 6px 18px rgba(10,6,23,.24);--ui-gold-shadow:inset 0 2px 0 #FFF0A2,inset 0 -4px 0 #E38B00,0 0 0 2px #522748,0 0 14px rgba(255,177,29,.26);--display:'Bungee','Arial Black',system-ui,sans-serif;--body:'Baloo 2','Noto Sans Telugu','Trebuchet MS',system-ui,sans-serif}
#hud [hidden]{display:none!important}
#hud *{scrollbar-width:thin;scrollbar-color:#9771B5 #241832}
#hud ::-webkit-scrollbar{width:6px;height:6px}
#hud ::-webkit-scrollbar-track{background:#241832;border-radius:8px}
#hud ::-webkit-scrollbar-thumb{background:#9771B5;border:1px solid #241832;border-radius:8px}
#hud .card,#hud .pill,#hud .ib{box-sizing:border-box;background:var(--ui-plum);border:1px solid #674A88;box-shadow:var(--ui-panel-shadow);color:var(--cream)}
#hud .pill{border-radius:999px;letter-spacing:.015em}
#hud .ib{border-radius:12px;min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;gap:7px}
#hud .ib:active,#hud .btn:active,#hud .opt:active{transform:scale(.97)}
#hud .fmap .movebtn:active{transform:translateX(-50%) scale(.97)}
#hud .ib:focus-visible,#hud .btn:focus-visible,#hud .opt:focus-visible{outline:3px solid var(--teal);outline-offset:3px}
#hud .btn{box-sizing:border-box;min-height:44px;border:2px solid #B99AE1;border-radius:16px;box-shadow:inset 0 1px 0 rgba(255,249,234,.22),0 3px 0 #100B1D;display:inline-flex;align-items:center;justify-content:center;gap:8px}
#hud .btn.go{background:linear-gradient(160deg,#FFD52B,#FFBF00 58%,#FFAA00);border-color:#FFF0A2;color:var(--ink);box-shadow:var(--ui-gold-shadow)}
#hud .btn.alt{background:linear-gradient(155deg,#443158,#2C203E);border-color:#82629F;color:var(--cream)}
#hud .modal{background:rgba(12,7,24,.8);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
#hud .sheet{background:var(--ui-plum);border:2px solid var(--ui-rim);border-radius:24px;box-shadow:inset 0 0 0 2px rgba(234,210,255,.08),0 0 18px rgba(160,100,234,.22),0 20px 70px rgba(0,0,0,.48);padding:20px;color:var(--cream)}
#hud .sheet h2{color:var(--cream);text-shadow:0 2px 0 #10091D}
#hud .sheet .k{color:var(--saffron)}
#hud .sheet .sm{color:var(--muted);line-height:1.4}
#hud .opt{min-height:48px;background:linear-gradient(145deg,#3F2C57,#271C3A);border:2px solid #664982;box-shadow:inset 0 1px 0 rgba(255,249,234,.08),0 2px 0 rgba(10,5,20,.65);border-radius:15px;color:var(--cream)}
#hud .opt[aria-pressed=true]{background:linear-gradient(145deg,#5E3D62,#3B2448);border-color:var(--saffron);box-shadow:inset 0 0 0 1px #E9A542,0 0 10px rgba(255,191,0,.18)}
#hud .opt:disabled{opacity:.48;cursor:not-allowed}
#hud .bar{background:#30213F;box-shadow:inset 0 1px 3px rgba(0,0,0,.48)}
#hud .bar>i{border-radius:inherit}
#hud #minimap{box-shadow:0 0 0 2px rgba(65,34,86,.7),0 0 16px rgba(197,158,241,.18)}
#hud .keys{border:1px solid #694B86;background:var(--ui-plum);box-shadow:var(--ui-panel-shadow)}
#hud .tip{background:var(--ui-plum);border-color:var(--teal);box-shadow:0 0 10px rgba(32,242,213,.15)}
#hud .area-chip{background:linear-gradient(145deg,#174A35,#092F24);border-color:#54EB9C;box-shadow:0 0 12px rgba(48,237,120,.2);color:#E8FFF0}
#hud .rotate{background:radial-gradient(ellipse at 50% 20%,#3F275C,#171125 70%)}
@media(hover:hover) and (pointer:fine){#hud .ib:hover,#hud .btn.alt:hover,#hud .opt:not(:disabled):hover{border-color:#D8BBFB}#hud .btn.go:hover{filter:brightness(1.06)}}
@media(max-height:520px){#hud .sheet{padding:14px;border-radius:20px}#hud .ib{min-height:44px}}
@media(prefers-reduced-motion:reduce){#hud .btn,#hud .ib,#hud .opt{transition:none}}
`;

export function installPrototypeTheme() {
  if (document.getElementById('prototype-ui-theme')) return;
  const style = document.createElement('style');
  style.id = 'prototype-ui-theme';
  style.textContent = PROTOTYPE_THEME_CSS;
  document.head.appendChild(style);
}
