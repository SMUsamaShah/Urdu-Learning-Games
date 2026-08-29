import { create as growVine, still as stillVine } from './vine.js';

/* The vine, with somebody climbing it. */

export function create(scene, box) {
  return growVine(scene, box, { rider: true });
}

export function still(scene, box, at) {
  return stillVine(scene, box, at, { rider: true });
}

export const NAME = 'Ladybird';
