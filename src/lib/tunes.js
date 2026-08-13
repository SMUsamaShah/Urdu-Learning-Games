/**
 * The pieces of music, as data.
 *
 * Separated from the machinery that plays them because these are the part a
 * person has an opinion about, and the only way to find out which one is any
 * good is to render each and listen — `npm run music:preview -- --tune waltz`.
 * Whoever is doing that should not have to read a scheduler to change a melody.
 *
 * ## What a tune is
 *
 * @typedef {object} Tune
 * @property {string} name       what it is, for the person choosing
 * @property {string} instrument folder under public/audio/instruments
 * @property {number} bpm
 * @property {number} swing      0 for straight, ~0.12 for a lilt
 * @property {number} beats      beats per bar: 4, or 3 for a waltz
 * @property {[string|null, number][]} melody  [note, length in beats], null = rest
 * @property {{pad: string[], bass: [number, string][]}[]} bars  one per bar;
 *   bass events are [beat within the bar, note]
 * @property {number[]} pulse    beats within a bar that get a shaker hit
 * @property {string[]} [drone]  notes held under the whole loop, for the modal one
 * @property {number} [padLength] how long a pad chord is held, in beats
 *
 * ## What they have in common
 *
 * All of them stay inside a pentatonic scale except where a leading note is
 * doing a specific job, because a pentatonic scale cannot produce a sour
 * interval and this is heard hundreds of times. All of them have a rest in
 * them: a loop with no gap is exhausting, and the gap is what makes the phrase
 * sound like a sentence rather than a list. And all of them are eight bars,
 * which at these tempos is fifteen to twenty seconds — long enough not to feel
 * like a ringtone, short enough to hold together.
 */

/** Root and fifth: the oldest bass line there is, and it never fights a melody. */
const rootFifth = (root, fifth) => [
  [0, root],
  [2, fifth],
];

export const TUNES = {
  /**
   * Gentle, even, unhurried. The default, and the safest thing to have running
   * while a child is concentrating on something else.
   */
  'music-box': {
    name: 'Music box — gentle, even, unhurried',
    instrument: 'music_box',
    bpm: 104,
    swing: 0.12,
    beats: 4,
    melody: [
      // Bars 1-2: the question.
      ['C5', 0.5], ['C5', 0.5], ['A4', 1], ['G4', 1], ['E4', 1],
      ['A4', 0.5], ['A4', 0.5], ['G4', 1], ['E4', 1], ['C4', 1],
      // Bars 3-4: it climbs, and lands unresolved.
      ['F4', 0.5], ['G4', 0.5], ['A4', 1], ['C5', 1], ['A4', 1],
      ['G4', 1], ['B4', 1], ['D5', 1.5], [null, 0.5],
      // Bars 5-6: the answer, a step higher.
      ['C5', 0.5], ['D5', 0.5], ['E5', 1], ['C5', 1], ['G4', 1],
      ['A4', 0.5], ['C5', 0.5], ['A4', 1], ['G4', 1], ['E4', 1],
      // Bars 7-8: home, with room to breathe.
      ['F4', 1], ['A4', 1], ['C5', 1], ['A4', 1],
      ['G4', 0.5], ['A4', 0.5], ['C5', 2], [null, 1],
    ],
    // I - vi - IV - V, the progression half of all nursery music is built on,
    // for the reason that it goes round for ever without sounding finished.
    bars: [
      { pad: ['C3', 'E3', 'G3'], bass: rootFifth('C3', 'G2') },
      { pad: ['A2', 'C3', 'E3'], bass: rootFifth('A2', 'E2') },
      { pad: ['F2', 'A2', 'C3'], bass: rootFifth('F3', 'C3') },
      { pad: ['G2', 'B2', 'D3'], bass: rootFifth('G3', 'D3') },
      { pad: ['C3', 'E3', 'G3'], bass: rootFifth('C3', 'G2') },
      { pad: ['A2', 'C3', 'E3'], bass: rootFifth('A2', 'E2') },
      { pad: ['F2', 'A2', 'C3'], bass: rootFifth('F3', 'C3') },
      { pad: ['G2', 'B2', 'D3'], bass: rootFifth('G3', 'D3') },
    ],
    pulse: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
  },

  /**
   * Quick and bouncy, for when the app should feel like a playground.
   *
   * The difference from the music box is not the instrument, it is the
   * rhythm: this one syncopates, leaning on the offbeat so the tune skips
   * rather than walks. I - V - vi - IV, the other progression everything is
   * built on, which resolves where the first one does not.
   */
  skip: {
    name: 'Skip — quick, bouncy, playground',
    instrument: 'marimba',
    bpm: 126,
    swing: 0.16,
    beats: 4,
    melody: [
      ['G4', 0.5], ['C5', 0.5], ['E5', 1], ['D5', 0.5], ['C5', 0.5], ['G4', 1],
      ['D5', 0.5], ['B4', 0.5], ['G4', 1], ['A4', 0.5], ['B4', 0.5], ['D5', 1],
      ['C5', 0.5], ['A4', 0.5], ['E4', 1], ['G4', 0.5], ['A4', 0.5], ['C5', 1],
      ['A4', 0.5], ['F4', 0.5], ['C5', 1], ['A4', 1], [null, 1],
      ['E5', 0.5], ['D5', 0.5], ['C5', 1], ['G4', 0.5], ['E4', 0.5], ['G4', 1],
      ['B4', 0.5], ['D5', 0.5], ['B4', 1], ['A4', 1], ['G4', 1],
      ['A4', 1], ['C5', 1], ['E5', 1], ['C5', 1],
      ['F4', 0.5], ['A4', 0.5], ['C5', 2], [null, 1],
    ],
    bars: [
      { pad: ['C3', 'E3', 'G3'], bass: rootFifth('C3', 'G2') },
      { pad: ['G2', 'B2', 'D3'], bass: rootFifth('G2', 'D3') },
      { pad: ['A2', 'C3', 'E3'], bass: rootFifth('A2', 'E3') },
      { pad: ['F2', 'A2', 'C3'], bass: rootFifth('F2', 'C3') },
      { pad: ['C3', 'E3', 'G3'], bass: rootFifth('C3', 'G2') },
      { pad: ['G2', 'B2', 'D3'], bass: rootFifth('G2', 'D3') },
      { pad: ['A2', 'C3', 'E3'], bass: rootFifth('A2', 'E3') },
      { pad: ['F2', 'A2', 'C3'], bass: rootFifth('F2', 'C3') },
    ],
    // Offbeats only, which is what makes it skip rather than march.
    pulse: [0, 0.75, 1.5, 2, 2.75, 3.5],
  },

  /**
   * Three beats to the bar, slow, for winding down.
   *
   * A waltz is the one metre a small child recognises without being told —
   * it is what a music box and a mobile above a cot both do — and it is the
   * obvious thing to reach for when the tune should be calming rather than
   * encouraging. Oom-pah-pah underneath: root on one, chord on two and three.
   */
  waltz: {
    name: 'Waltz — slow, three beats, calming',
    instrument: 'celesta',
    bpm: 92,
    swing: 0,
    beats: 3,
    melody: [
      ['E5', 1], ['D5', 1], ['C5', 1],
      ['C5', 1], ['B4', 1], ['A4', 1],
      ['A4', 1], ['G4', 1], ['F4', 1],
      ['G4', 1.5], ['A4', 0.5], ['B4', 1],
      ['C5', 1], ['E5', 1], ['D5', 1],
      ['B4', 1], ['G4', 1], ['E4', 1],
      ['F4', 1], ['A4', 1], ['C5', 1],
      ['B4', 1], ['D5', 1], [null, 1],
    ],
    bars: [
      { pad: ['C3', 'E3', 'G3'], bass: [[0, 'C3']] },
      { pad: ['A2', 'C3', 'E3'], bass: [[0, 'A2']] },
      { pad: ['F2', 'A2', 'C3'], bass: [[0, 'F2']] },
      { pad: ['G2', 'B2', 'D3'], bass: [[0, 'G2']] },
      { pad: ['C3', 'E3', 'G3'], bass: [[0, 'C3']] },
      { pad: ['E2', 'G2', 'B2'], bass: [[0, 'E2']] },
      { pad: ['F2', 'A2', 'C3'], bass: [[0, 'F2']] },
      { pad: ['G2', 'B2', 'D3'], bass: [[0, 'G2']] },
    ],
    // Two and three, never one. The gap on the downbeat is the waltz.
    pulse: [1, 2],
    padLength: 2,
  },

  /**
   * A subcontinental melody, which is the one that actually belongs here.
   *
   * This app teaches Urdu, and the tune under it has so far been a European
   * nursery rhyme. The notes here are Raga Bhupali — Sa Re Ga Pa Dha, which
   * happens to be the same five notes as the major pentatonic, so it stays
   * inside the same safe scale while sounding nothing like the others.
   *
   * What makes it sound like itself is not the scale but the treatment: a
   * drone instead of a chord progression, phrases that circle back to the
   * tonic rather than resolving to it, and a sitar. There is no I-IV-V here
   * because that idea does not exist in the music this is borrowing from —
   * putting one under it is what makes "world music" sound like a costume.
   */
  qaida: {
    name: 'Qaida — sitar and drone, Raga Bhupali',
    instrument: 'sitar',
    bpm: 96,
    swing: 0,
    beats: 4,
    melody: [
      ['G4', 1], ['A4', 0.5], ['G4', 0.5], ['E4', 1], ['D4', 1],
      ['E4', 1], ['G4', 1], ['A4', 1.5], [null, 0.5],
      ['C5', 1], ['A4', 0.5], ['G4', 0.5], ['A4', 1], ['G4', 1],
      ['E4', 1], ['D4', 1], ['C4', 2],
      ['G4', 0.5], ['A4', 0.5], ['C5', 1], ['D5', 1], ['C5', 1],
      ['A4', 1], ['G4', 1], ['E4', 1], ['G4', 1],
      ['D4', 1], ['E4', 1], ['G4', 1], ['A4', 1],
      ['G4', 1.5], ['E4', 0.5], ['C4', 1], [null, 1],
    ],
    // No progression: the same open fifth throughout, which is what a tanpura
    // does. A third in there would impose a major key on music that has no
    // concept of one.
    bars: Array.from({ length: 8 }, () => ({
      pad: ['C3', 'G3'],
      bass: [[0, 'C3']],
    })),
    // Sparse and uneven, closer to a hand drum keeping time than a shaker.
    pulse: [0, 1.5, 2, 3.5],
    drone: ['C2', 'G2'],
  },

  /**
   * The plainest option: a nylon guitar, no twinkle at all.
   *
   * Here because the other four are all bright struck metal or wood of one
   * kind or another, and "five variations on twinkly" is not a choice. If the
   * others are too much after an hour, this is what too much sounds like when
   * it is dialled all the way back.
   */
  stroll: {
    name: 'Stroll — nylon guitar, plain and warm',
    instrument: 'acoustic_guitar_nylon',
    bpm: 88,
    swing: 0.08,
    beats: 4,
    melody: [
      ['E4', 1], ['G4', 1], ['C5', 1.5], [null, 0.5],
      ['D5', 1], ['C5', 1], ['A4', 2],
      ['G4', 1], ['E4', 1], ['G4', 1.5], [null, 0.5],
      ['A4', 1], ['G4', 1], ['E4', 2],
      ['C5', 1], ['D5', 1], ['E5', 1.5], [null, 0.5],
      ['D5', 1], ['C5', 1], ['A4', 2],
      ['G4', 1], ['A4', 1], ['C5', 1], ['A4', 1],
      ['G4', 1], ['E4', 1], ['C4', 2],
    ],
    bars: [
      { pad: ['C3', 'E3', 'G3'], bass: rootFifth('C3', 'G2') },
      { pad: ['A2', 'C3', 'E3'], bass: rootFifth('A2', 'E2') },
      { pad: ['F2', 'A2', 'C3'], bass: rootFifth('F2', 'C3') },
      { pad: ['C3', 'E3', 'G3'], bass: rootFifth('C3', 'G2') },
      { pad: ['F2', 'A2', 'C3'], bass: rootFifth('F2', 'C3') },
      { pad: ['G2', 'B2', 'D3'], bass: rootFifth('G2', 'D3') },
      { pad: ['A2', 'C3', 'E3'], bass: rootFifth('A2', 'E2') },
      { pad: ['C3', 'E3', 'G3'], bass: rootFifth('C3', 'G2') },
    ],
    // Quarter notes only. Anything busier undoes the point of this one.
    pulse: [0, 1, 2, 3],
  },
};

/** The one that plays. Change this to change the app's music. */
export const DEFAULT_TUNE = 'qaida';
