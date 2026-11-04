/** The HUD/runtime must already exist when the preparation promise is taken.
 * Hold both initial relocation and the frame loop until current actors are GPU
 * ready. Upcoming actors are deliberately absent from this barrier. */
export async function launchPreparedGame(currentPreparation: Promise<void> | undefined, launch: () => void) {
  await currentPreparation;
  launch();
}
