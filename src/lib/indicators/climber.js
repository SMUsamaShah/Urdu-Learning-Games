import { create as growVine, still as stillVine } from './vine.js';

/**
 * The vine, with somebody climbing it.
 *
 * The same cane and the same leaves — this is not a second drawing of a plant —
 * with a ladybird riding the growing tip. A right answer carries it up one
 * leaf; a wrong one drops it two, turning over as it goes.
 *
 * ## Why the fall is worth having
 *
 * A vine that gets shorter is a fact about a plant. A ladybird that slips down
 * is something happening to somebody, and a three-year-old reads the second one
 * without being told. It is still not a fail state — nothing locks, no round
 * ends, and it lands on a leaf and starts climbing again — but it is the
 * clearest the setback ever gets, which is the point of offering it.
 *
 * ## Why a ladybird and not the spider
 *
 * The app's mascot is a spider and a spider climbing a strand would be the
 * obvious thing. But the spider is four drawn poses with no climbing one among
 * them, and a procedural spider standing next to a drawn one reads as a
 * different animal rather than as the same character. A ladybird is two
 * ellipses and six legs, cannot be mistaken for the mascot, and is drawn in
 * greenery.js beside everything else in the rail.
 */

export function create(scene, box) {
  return growVine(scene, box, { rider: true });
}

export function still(scene, box, at) {
  return stillVine(scene, box, at, { rider: true });
}

export const NAME = 'Ladybird';
