import type { Object3D } from 'three';

type DynamicSubtree = (object: Object3D) => boolean;

const hasUpdateHook: DynamicSubtree = object => typeof object.userData.update === 'function';

/**
 * Cache transforms for scenery whose position, rotation, scale and ancestors are final.
 * Visibility/material changes remain safe. Dynamic subtrees keep their normal update
 * flags; pass a predicate when animation is owned elsewhere rather than userData.update.
 *
 * Call after attachment to the final, stationary parent. A later child still updates
 * normally; freeze that child separately once it is attached and complete. Moving or
 * reparenting a frozen object requires restoring its automatic update flags first.
 * This does not replace Three's traversal, so animated descendants still get updates.
 */
export function freezeStaticTransforms(root: Object3D, isDynamic: DynamicSubtree = hasUpdateHook): number {
  if (isDynamic(root)) return 0;
  root.updateWorldMatrix(true, true);
  let count = 0;
  const freeze = (object: Object3D): void => {
    if (isDynamic(object)) return;
    object.matrixAutoUpdate = false;
    object.matrixWorldAutoUpdate = false;
    count++;
    for (const child of object.children) freeze(child);
  };
  freeze(root);
  return count;
}
