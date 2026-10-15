// Small seeded PRNG (mulberry32). A seed can be forced with ?seed=1234 in the URL
// which makes animatronic behaviour reproducible for debugging.

export function createRng(seed = (Math.random() * 2 ** 32) >>> 0) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed: seed >>> 0,
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    d20: () => 1 + Math.floor(next() * 20),
    /** Pick from [{value, weight}] */
    weighted(items) {
      const total = items.reduce((s, i) => s + i.weight, 0);
      if (total <= 0) return null;
      let r = next() * total;
      for (const i of items) {
        r -= i.weight;
        if (r <= 0) return i.value;
      }
      return items[items.length - 1].value;
    },
  };
}
