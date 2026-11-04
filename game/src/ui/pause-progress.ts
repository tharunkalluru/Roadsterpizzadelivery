/** Content-sized campaign summary. Filled segments include the current level,
 * while their states distinguish already delivered levels from the active one. */
export interface PauseProgress {
  current: number;
  total: number;
  completed: number;
}

export function pauseProgressHtml(progress?: PauseProgress): string {
  if (!progress || !Number.isFinite(progress.total) || progress.total < 1) return '';
  const total = Math.floor(progress.total);
  const current = Math.max(1, Math.min(total, Math.floor(Number.isFinite(progress.current) ? progress.current : 1)));
  const completed = Math.max(0, Math.min(total, Math.floor(Number.isFinite(progress.completed) ? progress.completed : 0)));
  const position = Math.max(current, completed);
  const state = (index: number) => index < completed ? 'completed' : index === current - 1 ? 'current' : 'locked';
  return `<section class="pause-progress" aria-label="Delivery progress"><div class="pause-progress-heading"><strong>Level ${current} / ${total}</strong><span>${completed} completed</span></div><div class="pause-segments" role="progressbar" aria-label="Delivery levels" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${position}" aria-valuetext="Level ${current} of ${total}, ${completed} completed" style="--progress-columns:${Math.min(total, 14)}">${Array.from({ length: total }, (_, index) => `<span class="pause-segment" data-state="${state(index)}" aria-hidden="true"></span>`).join('')}</div></section>`;
}
