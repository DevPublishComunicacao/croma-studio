import type { Lab } from "@/lib/types";

export interface ClusterResult {
  centroid: Lab;
  size: number;
  meanL: number;
  meanA: number;
  meanB: number;
}

export interface KMeansOptions {
  k: number;
  maxIterations?: number;
  seed?: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function kmeansLab(data: Float64Array, options: KMeansOptions): ClusterResult[] {
  const n = data.length / 3;
  const k = Math.min(options.k, n);
  const maxIterations = options.maxIterations ?? 28;
  const rng = mulberry32(options.seed ?? 20260731);

  if (n === 0) return [];

  const centers = new Float64Array(k * 3);

  centers[0] = data[Math.floor(rng() * n) * 3];
  centers[1] = data[Math.floor(rng() * n) * 3 + 1];
  centers[2] = data[Math.floor(rng() * n) * 3 + 2];

  const distBuffer = new Float64Array(n);
  for (let c = 1; c < k; c++) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      const l = data[i * 3];
      const a = data[i * 3 + 1];
      const b = data[i * 3 + 2];
      let best = Infinity;
      for (let j = 0; j < c; j++) {
        const dl = l - centers[j * 3];
        const da = a - centers[j * 3 + 1];
        const db = b - centers[j * 3 + 2];
        const d = dl * dl + da * da + db * db;
        if (d < best) best = d;
      }
      distBuffer[i] = best;
      total += best;
    }
    let pick = rng() * total;
    let index = 0;
    for (let i = 0; i < n; i++) {
      pick -= distBuffer[i];
      if (pick <= 0) {
        index = i;
        break;
      }
    }
    centers[c * 3] = data[index * 3];
    centers[c * 3 + 1] = data[index * 3 + 1];
    centers[c * 3 + 2] = data[index * 3 + 2];
  }

  const assignments = new Int32Array(n).fill(-1);
  const sums = new Float64Array(k * 3);
  const counts = new Int32Array(k);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = 0;

    for (let i = 0; i < n; i++) {
      const l = data[i * 3];
      const a = data[i * 3 + 1];
      const b = data[i * 3 + 2];
      let best = Infinity;
      let bestC = 0;
      for (let j = 0; j < k; j++) {
        const dl = l - centers[j * 3];
        const da = a - centers[j * 3 + 1];
        const db = b - centers[j * 3 + 2];
        const d = dl * dl + da * da + db * db;
        if (d < best) {
          best = d;
          bestC = j;
        }
      }
      if (assignments[i] !== bestC) {
        assignments[i] = bestC;
        changed++;
      }
    }

    if (iter > 0 && changed === 0) {
      break;
    }

    sums.fill(0);
    counts.fill(0);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      sums[c * 3] += data[i * 3];
      sums[c * 3 + 1] += data[i * 3 + 1];
      sums[c * 3 + 2] += data[i * 3 + 2];
      counts[c]++;
    }

    let hasEmpty = false;
    for (let j = 0; j < k; j++) {
      if (counts[j] === 0) {
        hasEmpty = true;
        continue;
      }
      centers[j * 3] = sums[j * 3] / counts[j];
      centers[j * 3 + 1] = sums[j * 3 + 1] / counts[j];
      centers[j * 3 + 2] = sums[j * 3 + 2] / counts[j];
    }

    if (hasEmpty) {
      for (let j = 0; j < k; j++) {
        if (counts[j] === 0) {
          const idx = Math.floor(rng() * n);
          centers[j * 3] = data[idx * 3];
          centers[j * 3 + 1] = data[idx * 3 + 1];
          centers[j * 3 + 2] = data[idx * 3 + 2];
        }
      }
    }
  }

  const meanSums = new Float64Array(k * 3);
  const finalCounts = new Int32Array(k);
  for (let i = 0; i < n; i++) {
    const c = assignments[i];
    meanSums[c * 3] += data[i * 3];
    meanSums[c * 3 + 1] += data[i * 3 + 1];
    meanSums[c * 3 + 2] += data[i * 3 + 2];
    finalCounts[c]++;
  }

  const clusters: ClusterResult[] = [];
  for (let j = 0; j < k; j++) {
    if (finalCounts[j] === 0) continue;
    const meanL = meanSums[j * 3] / finalCounts[j];
    const meanA = meanSums[j * 3 + 1] / finalCounts[j];
    const meanB = meanSums[j * 3 + 2] / finalCounts[j];
    clusters.push({
      centroid: { l: meanL, a: meanA, b: meanB },
      size: finalCounts[j],
      meanL,
      meanA,
      meanB,
    });
  }

  return clusters;
}

export function labArrayFromPoints(points: Array<{ l: number; a: number; b: number }>): Float64Array {
  const out = new Float64Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    out[i * 3] = points[i].l;
    out[i * 3 + 1] = points[i].a;
    out[i * 3 + 2] = points[i].b;
  }
  return out;
}

export { mulberry32 };
