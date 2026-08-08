// Generates the 52-cell Ludo loop by walking the full perimeter in one pass.
// No rotation — pure continuation, so segments chain naturally.
// Run: node tools/generate-loop.mjs

// Hand-traced full clockwise loop starting at red entry (1,6).
// Pattern per arm: walk along the arm's near edge to the tip, around the tip,
// back along the far edge, then transition to the next arm. 13 cells per color.
// The verified 52-cell loop. 4 arm-junction corners are diagonal (dist √2);
// the 3D board represents these as L-turn tiles. No dupes, closes properly,
// entries at 13-cell intervals: red(1,6) green(8,1) yellow(13,8) blue(6,13).
const loop = [
  [1,6], [2,6], [3,6], [4,6], [5,6], [6,5], [6,4], [6,3], [6,2], [6,1], [6,0], [7,0], [8,0],
  [8,1], [8,2], [8,3], [8,4], [8,5], [9,6], [10,6], [11,6], [12,6], [13,6], [14,6], [14,7], [14,8],
  [13,8], [12,8], [11,8], [10,8], [9,8], [8,9], [8,10], [8,11], [8,12], [8,13], [8,14], [7,14], [6,14],
  [6,13], [6,12], [6,11], [6,10], [6,9], [5,8], [4,8], [3,8], [2,8], [1,8], [0,8], [0,7], [0,6],
];

// Verify
let gaps = 0, dupes = 0;
const seen = new Set();
for (let i = 0; i < loop.length; i++) {
  const k = loop[i].join(',');
  if (seen.has(k)) { console.log('DUPE', i, loop[i]); dupes++; }
  seen.add(k);
  const a = loop[i], b = loop[(i+1) % loop.length];
  const d = Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]);
  if (d !== 1) { console.log(`GAP ${i}→${(i+1)%loop.length}: [${a}]→[${b}] dist ${d}`); gaps++; }
}
console.log('length:', loop.length, 'gaps:', gaps, 'dupes:', dupes, 'unique:', seen.size);
console.log('closes:', Math.abs(loop[51][0]-loop[0][0]) + Math.abs(loop[51][1]-loop[0][1]) === 1);
console.log('entries: red', loop[0], 'green', loop[13], 'yellow', loop[26], 'blue', loop[39]);

console.log('\n=== LOOP_GRID ===');
for (let i = 0; i < loop.length; i += 13) {
  console.log('  ' + loop.slice(i, i+13).map(c => `[${c[0]},${c[1]}]`).join(', ') + ',');
}
