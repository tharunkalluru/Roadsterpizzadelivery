# Required game fixes release

This release follows the user's narrowed scope: publish the required game fixes
and keep the unfinished global road reconstruction separate.

Included: grounded and stationary story entry; physical pizza cargo after
pickup; actor meal/lip performance; container delivery exit and camera fixes;
moving-train character-view camera and measured rider clearance; traffic posture
and road-surface sampling; closed divider ends and continuous road paint;
rickshaw canopy closure; keyboard focus/braking; settings instructions and icon.

The 14-level campaign and approved 17-character registry remain present. The
existing live road input files and main/worker road preparation are retained
from a679b72. `audit-required-fixes-release.mjs` checks those files and all 304 raw
packs before building. No global numerical road candidate, source normalization,
experimental fitted cache or new underpass is selected. This release does not
claim that every map-wide road merge or flyover defect has been reconstructed.

Validation on this isolated release:

- Main and worker TypeScript checks pass.
- 1,172 current runtime tests pass with no skips or failures.
- 37 legacy suites passed together; the remaining bug-report fixture was
  updated to the explicit scoped build-input inventory and its 16 groups pass.
- The focused train-rider clearance suite passes.
- All 17 character appearances pass the existing campaign asset gate.
- All stable-road input and raw-pack digest checks pass.

The first two test attempts exposed missing copied test fixtures; those attempts
are preserved locally. The successful run includes the actual fixtures. These
are desktop/compatibility checks, not physical-phone FPS, heat or battery claims.

Lossless asset transport preserves the original model/texture/script bytes and
keeps the Sites package within its 256 MiB limit. Build identity includes the
scoped road baseline and release audit. Publication requires a clean committed
source, successful build and a terminal successful Sites deployment.
