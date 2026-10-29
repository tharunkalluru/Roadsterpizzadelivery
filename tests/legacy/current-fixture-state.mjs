// Defaults for fixtures which deliberately bypass Version21 constructors.
// Keep behavior and expectations in each suite. These are baseline-owned fields;
// rejected NextLab streaming, pooling and flight-controller state is not emulated.
export function trafficFixtureState() { return { passengerExchanges: [] }; }
export function playerFixtureState() {
  return { jumpCooldown: 0, jumpActive: false, jumpHeld: false, jumpCooldownPendingLanding: false,
    jumpBodyTop: 2.4, jumpStartY: 0, jumpElapsed: 0, jumpForcedFall: false,
    jumpCollisionMeshes: [], jumpBoundsDirty: true, jumpBounds: { bottom: 0, top: 0 },
    nozzles: [], pods: [], thrusterDeployment: 0, wasFlying: false, puffAcc: 0, burst: 0,
    gas: { emit() {}, update() {} }, setDeployment() {} };
}
// The original loader publishes built replies synchronously. Each loader suite
// supplies its own publication stub; no incremental preparation pump is needed.
export function worldFixtureState() { return {}; }
