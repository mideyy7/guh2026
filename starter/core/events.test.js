const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('./events.js');

// Small seeded RNG so failures are reproducible.
function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function shuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function makeSource(n) {
  const src = E.emptyLog(); const evs = [];
  for (let i = 0; i < n; i++) evs.push(E.emit(src, 'drone-1', 'CELL_SEARCHED', { cell: `c${i % 7}` }, i));
  evs.push(E.emit(src, 'drone-1', 'RESCUED', { survivorId: 's1' }, n));
  return { src, evs };
}

test('a gap is never acknowledged: event 7 before 6 leaves vv at 5', () => {
  const { evs } = makeSource(10);
  const dst = E.emptyLog();
  E.receive(dst, evs.slice(0, 5));
  E.receive(dst, [evs[6]]);                 // seq 7
  assert.equal(dst.vv['drone-1'], 5);
  E.receive(dst, [evs[5]]);                 // seq 6 fills the gap
  assert.equal(dst.vv['drone-1'], 7);
});

test('500 random shuffles with duplicates converge to the identical replicated state', () => {
  const { src, evs } = makeSource(30);
  for (let s = 1; s <= 500; s++) {
    const r = rng(s);
    const dst = E.emptyLog();
    const noisy = shuffle(evs.concat(evs.filter(() => r() < 0.5)), r); // ~50% duplicated
    for (let i = 0; i < noisy.length; i += 1 + Math.floor(r() * 4)) E.receive(dst, noisy.slice(i, i + 4));
    assert.deepEqual(dst.vv, src.vv, `seed ${s}`);
    assert.deepEqual(dst.searched, src.searched);
    assert.deepEqual(dst.rescued, src.rescued);
    assert.equal(Object.keys(dst.events).length, evs.length);
    assert.deepEqual(dst.pending, {});
  }
});

test('anti-entropy sends only what the peer lacks, and replay is harmless', () => {
  const { src } = makeSource(12);
  assert.equal(E.missingFor(src, { 'drone-1': 10 }).length, 3); // seqs 11,12,13
  const dst = E.emptyLog();
  E.receive(dst, E.missingFor(src, {}));
  const again = E.receive(dst, E.missingFor(src, {}));           // full replay
  assert.equal(again.length, 0);
  assert.deepEqual(dst.vv, src.vv);
});
