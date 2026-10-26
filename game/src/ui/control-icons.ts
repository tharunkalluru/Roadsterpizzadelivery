// Small native vectors keep the prototype's chunky icon language crisp at phone sizes.
const paths = {
  left: '<path d="M21.8 3.5a4 4 0 0 1 0 5.7L15 16l6.8 6.8a4 4 0 1 1-5.6 5.7l-9.7-9.7a4 4 0 0 1 0-5.6l9.7-9.7a4 4 0 0 1 5.6 0Z"/>',
  right: '<path d="M10.2 3.5a4 4 0 0 0 0 5.7L17 16l-6.8 6.8a4 4 0 1 0 5.6 5.7l9.7-9.7a4 4 0 0 0 0-5.6l-9.7-9.7a4 4 0 0 0-5.6 0Z"/>',
  up: '<path d="M3.5 21.8a4 4 0 0 1 0-5.6l9.7-9.7a4 4 0 0 1 5.6 0l9.7 9.7a4 4 0 0 1-5.7 5.6L16 15l-6.8 6.8a4 4 0 0 1-5.7 0Z"/>',
  down: '<path d="M13.2 27.5a4 4 0 0 0 5.6 0l9.7-9.7a4 4 0 0 0-5.7-5.6L20 15V6a4 4 0 0 0-8 0v9l-2.8-2.8a4 4 0 0 0-5.7 5.6l9.7 9.7Z"/>',
  brake: '<circle cx="16" cy="17" r="10"/><circle cx="16" cy="17" r="4" fill="var(--brake-face,#e5d6ff)"/><path d="M14 1h5v7h-5zM3.5 7.5l4-3 4 5.5-4 3zM24 6l4 3-4 5.5-4-3z"/><circle cx="16" cy="17" r="2"/>',
  coin: '<circle cx="16" cy="16" r="14"/><circle cx="16" cy="16" r="10" fill="none" stroke="var(--coin-rim,#ffe68a)" stroke-width="2"/>',
  pin: '<path d="M16 1A12 12 0 0 0 4 13c0 8 12 18 12 18s12-10 12-18A12 12 0 0 0 16 1Zm0 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z"/>',
  bag: '<path d="M9 9V7a7 7 0 0 1 14 0v2h4l3 20H2L5 9h4Zm4 0h6V7a3 3 0 0 0-6 0v2Z"/>',
  route: '<circle cx="7" cy="25" r="5"/><circle cx="25" cy="7" r="5"/><path d="M7 20v-5h11V7h3v11H10v2Z"/>',
  info: '<circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="16" cy="9" r="2"/><path d="M14 14h4v11h-4z"/>',
  check: '<path d="m5 16 7 7L27 8" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
  cruise: '<path d="M16 3a13 13 0 0 0-9 22l3-3a9 9 0 1 1 12 0l3 3A13 13 0 0 0 16 3Z"/><path d="m15 14 9-5-5 9a3 3 0 1 1-4-4Z"/><path d="M14 4h4v5h-4zM4 13h5v4H4zM23 13h5v4h-5z"/>',
};

export function controlIcon(name: keyof typeof paths, cls = '') {
  return `<svg class="ui-icon ${cls}" viewBox="0 0 32 32" aria-hidden="true" focusable="false" fill="currentColor">${paths[name]}</svg>`;
}
