import * as vine from './vine.js';
import * as tree from './tree.js';
import * as climber from './climber.js';
import * as bar from './bar.js';
import * as glass from './glass.js';

/* The things that can stand in the progress rail, and which one is chosen. */
export const INDICATORS = [
  { id: 'vine', name: 'Vine', module: vine },
  { id: 'tree', name: 'Tree', module: tree },
  { id: 'climber', name: 'Ladybird', module: climber },
  { id: 'bar', name: 'Bar', module: bar },
  { id: 'glass', name: 'Glass of juice', module: glass },
];

const KEY = 'urdu-games:indicator';
/* Which one a device with no preference gets. */
const DEFAULT = 'vine';

export function indicatorNames() {
  return INDICATORS.map(({ id, name }) => ({ id, name }));
}

export function currentIndicator() {
  try {
    const saved = localStorage.getItem(KEY);
    return INDICATORS.some((i) => i.id === saved) ? saved : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function setIndicator(id) {
  if (!INDICATORS.some((i) => i.id === id)) return;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private browsing; it just will not be remembered */
  }
}

/* The chosen one's module, falling back rather than throwing. */
export function indicatorModule(id = currentIndicator()) {
  return (INDICATORS.find((i) => i.id === id) ?? INDICATORS[0]).module;
}
