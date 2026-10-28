import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/game';
import { World } from '../src/world/world';
import { movementCoverageNeed } from '../src/game/streaming-boundary';

const deferred = () => { let resolve!: () => void, reject!: (error: Error) => void; const promise = new Promise<void>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

function fixture() {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const classes = new Set<string>(), loader: any = { hidden: true, setAttribute() {}, querySelectorAll: () => [] };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: false,
    documentElement: { classList: { add: (s: string) => classes.add(s), remove: (s: string) => classes.delete(s) } },
    getElementById: (id: string) => id === 'loading' ? loader : null } });
  const game: any = Object.create(Game.prototype), calls: string[] = [], pins = new Map<string, string[]>();
  Object.assign(game, { streamingBoundary: null, streamingBoundarySequence: 0, paused: false, choosing: false, relocating: false,
    area: { name: 'Current area' }, t: 20, minutes: 500, coins: 900, totalDelivered: 3,
    order: { state: 'toDrop', t: 42, heat: 88, slices: 8 }, nextOfferAt: null,
    hud: { modalOpen: false, tipOpen: false, rotationBlocked: false },
    player: { pos: { x: 994, y: .55, z: 100 }, forward: { x: 1, z: 0 }, speed: 20, lastKind: 'road', lastSupport: 0 },
    fixedStep: { accumulator: .015 }, keys: new Set(['KeyW']), flyQueued: true, jumpQueued: false,
    resetInput() { this.keys.clear(); this.flyQueued = false; calls.push('reset input'); },
    clock: { getDelta: () => calls.push('reset clock') },
    engine: { graphicsReady: true, prepareFrame: async () => { calls.push('prepare'); } },
    city: { packOf: new Map([['0_0', 'a'], ['1_0', 'b']]), tiles: new Map([['0_0', {}]]), empty: new Set(),
      coverageLeaseSequence: 0, coverageLeases: new Map(), ensureCoverage: new Map(), overlapReserve: 96 * 1024 * 1024, streamStats: {},
      wanted: World.prototype.wanted, acquireCoverageLease: World.prototype.acquireCoverageLease,
      updateCoverageReserve: (World.prototype as any).updateCoverageReserve,
      setStreamFocus(focus: any) { this.streamFocus = focus; },
      pinTiles: (id: string, keys: Iterable<string>) => pins.set(id, [...keys]),
      releasePin: (id: string) => pins.delete(id), ensure: async () => { calls.push('ensure'); } } });
  return { game, calls, pins, classes, loader, restore() {
    if (saved) Object.defineProperty(globalThis, 'document', saved); else delete (globalThis as any).document;
  } };
}

test('movement coverage ready/unmapped/known-empty fast paths do not stop ordinary streaming', () => {
  const city = { packOf: new Map([['0_0', 1], ['1_0', 1]]), tiles: new Map([['0_0', 1], ['1_0', 1]]), empty: new Set<string>() };
  assert.equal(movementCoverageNeed(city, 994, 100, 20, 0), null);
  city.tiles.delete('1_0'); city.packOf.delete('1_0');
  assert.equal(movementCoverageNeed(city, 994, 100, 20, 0), null, 'unmapped cells must never block');
  city.packOf.set('1_0', 1); city.empty.add('1_0');
  assert.equal(movementCoverageNeed(city, 994, 100, 20, 0), null);
  city.empty.clear();
  assert.deepEqual(movementCoverageNeed(city, 994, 100, 20, 0)?.missing, ['1_0']);
  assert.equal(movementCoverageNeed(city, 800, 100, 20, 0), null, 'far missing prefetch is not a stop condition');
});

test('delayed movement coverage freezes player, delivery and city timers until coherent world and view are ready', async () => {
  const f = fixture(), { game, calls, pins, classes } = f, world = deferred(), view = deferred();
  game.city.ensure = (_x: number, _z: number, _r: number, signal: AbortSignal) => { assert.equal(signal.aborted, false); calls.push('ensure'); return world.promise; };
  game.engine.prepareFrame = () => { calls.push('prepare'); return view.promise; };
  const before = JSON.stringify({ pos: game.player.pos, speed: game.player.speed, t: game.t, minutes: game.minutes, order: game.order, coins: game.coins });
  try {
    assert.equal(game.checkStreamingBoundary(), false);
    assert.equal(game.gameplayActive(), false); assert.ok(classes.has('game-loading'));
    assert.deepEqual(new Set([...pins.values()].flat()), new Set(['0_0', '1_0'])); assert.equal(game.keys.size, 0); assert.equal(game.flyQueued, false);
    for (let i = 0; i < 100; i++) game.simulationStep(1 / 60);
    game.queueFlight(); game.handleKeyDown({ code: 'KeyW' });
    assert.equal(game.keys.size, 0); assert.equal(game.flyQueued, false);
    assert.equal(JSON.stringify({ pos: game.player.pos, speed: game.player.speed, t: game.t, minutes: game.minutes, order: game.order, coins: game.coins }), before);
    game.city.tiles.set('1_0', {}); world.resolve(); await flush();
    assert.deepEqual(calls, ['reset input', 'ensure', 'prepare']);
    assert.equal(game.gameplayActive(), false, 'support publication alone cannot expose the unprepared view');
    view.resolve(); await flush();
    assert.equal(game.gameplayActive(), true); assert.equal(classes.has('game-loading'), false); assert.equal(pins.size, 0);
    assert.equal(game.checkStreamingBoundary(), true); assert.equal(calls.filter(c => c === 'ensure').length, 1);
  } finally { f.restore(); }
});

test('failed boundary preparation keeps committed support and delivery, then retries the same movement envelope', async () => {
  const f = fixture(), { game, pins } = f, retry = deferred(), second = deferred(), targets: number[][] = [];
  game.city.ensure = (x: number, z: number, radius: number) => { targets.push([x, z, radius]); return targets.length === 1 ? Promise.reject(new Error('offline')) : second.promise; };
  game.streamingRetry = (signal: AbortSignal) => { assert.equal(signal.aborted, false); return retry.promise; };
  try {
    game.checkStreamingBoundary(); await flush();
    assert.equal(game.gameplayActive(), false); assert.equal(game.city.tiles.has('0_0'), true); assert.equal(pins.size, 1);
    assert.equal(game.order.t, 42); assert.equal(game.coins, 900); assert.equal(game.player.pos.x, 994);
    retry.resolve(); await flush(); assert.deepEqual(targets[1], targets[0]);
    game.city.tiles.set('1_0', {}); second.resolve(); await flush();
    assert.equal(game.gameplayActive(), true); assert.equal(pins.size, 0); assert.equal(game.order.state, 'toDrop');
  } finally { f.restore(); }
});

test('valid explicit relocation aborts boundary recovery and stale completion cannot prepare or uncover its loader', async () => {
  const f = fixture(), { game, calls, pins, classes } = f, old = deferred(), relocation = deferred(); let oldSignal: AbortSignal | undefined;
  let ensures = 0;
  game.city.ensure = (_x: number, _z: number, _r: number, signal: AbortSignal) => { if (++ensures === 1) { oldSignal = signal; return old.promise; } return relocation.promise; };
  Object.assign(game, { order: null, validArea: () => true, traffic: { clearRetention() {} }, routeSearchGate: { reset() {} }, presentation: { reset() {} },
    picker: { hide() {} }, hud: { ...game.hud, tip() {}, offer() {}, modal() {} }, placeNear: () => false, relocationFailed() { this.relocating = false; } });
  try {
    game.checkStreamingBoundary();
    const moving = game.relocate({ name: 'New area', x: 2000, z: 100 });
    assert.equal(oldSignal?.aborted, true); assert.equal(game.streamingBoundary, null); assert.equal(pins.size, 1, 'new relocation owns its separate coverage lease');
    old.resolve(); await flush();
    assert.equal(calls.includes('prepare'), false); assert.ok(classes.has('game-loading'), 'stale recovery must not hide relocation loader');
    relocation.resolve(); await moving;
    assert.equal(pins.size, 0);
  } finally { f.restore(); }
});
