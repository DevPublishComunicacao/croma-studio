import { kmeansLab } from "@/lib/color/kmeans";
import {
  deltaE2000,
  labChroma,
  rgbToHex,
  rgbToLab,
} from "@/lib/color/conversions";
import { rgbToCmykApprox } from "@/lib/color/cmykApprox";
import { getIccProfile } from "@/lib/color/iccProfiles";
import type {
  AnalysisOptions,
  AnalysisResult,
  Cmyk,
  DominantColor,
  Lab,
  Rgb,
} from "@/lib/types";

const CLUSTER_COUNT = 10;
const MERGE_DELTA_E_2000 = 8;
const MIN_PREDOMINANCE_PERCENT = 10;
const MIN_DISTINCT_CHROMA = 40;
const MIN_MODE_PURITY = 0.15;

const WHITE_MIN_L = 88;
const WHITE_MAX_CHROMA = 10;
const BLACK_MAX_L = 12;
const BLACK_MAX_CHROMA = 25;
const GRAY_MAX_CHROMA = 8;

export const FILTER_STEPS: Record<keyof AnalysisOptions, string> = {
  mode: "Selecionando modo de análise",
  ignoreWhite: "Descartando brancos",
  ignoreBlack: "Descartando pretos",
  ignoreGrays: "Descartando cinzas",
  ignoreTransparentBackground: "Descartando fundo transparente",
  iccProfileId: "Aplicando perfil ICC",
};

interface WeightedCluster {
  centroid: Lab;
  size: number;
  meanL: number;
  meanChroma: number;
  memberIndices: number[];
}

export interface ProgressFn {
  (step: string): void;
}

export class AnalysisError extends Error {}

function filterAndCollect(
  imageData: ImageData,
  options: AnalysisOptions,
  nativeCmyk?: Uint8Array | null,
) {
  const { width, height, data } = imageData;
  const targetSamples = 180_000;
  const stride = Math.max(
    1,
    Math.floor(Math.sqrt((width * height) / targetSamples)),
  );

  const maxSamples = Math.ceil((width * height) / (stride * stride));
  const labs = new Float64Array(maxSamples * 3);
  const rgbs = new Uint8ClampedArray(maxSamples * 3);
  const cmyks = new Uint8ClampedArray(maxSamples * 4);
  const xs = new Float64Array(maxSamples);
  const ys = new Float64Array(maxSamples);

  let count = 0;
  let meanLAccum = 0;

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];

      if (alpha < 8) continue;
      if (options.ignoreTransparentBackground && alpha < 250) continue;

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const lab = rgbToLab({ r, g, b });
      const chroma = Math.sqrt(lab.a * lab.a + lab.b * lab.b);

      if (options.ignoreWhite && lab.l >= WHITE_MIN_L && chroma <= WHITE_MAX_CHROMA) continue;
      if (options.ignoreBlack && lab.l <= BLACK_MAX_L && chroma <= BLACK_MAX_CHROMA) continue;
      if (options.ignoreGrays && chroma <= GRAY_MAX_CHROMA) continue;

      labs[count * 3] = lab.l;
      labs[count * 3 + 1] = lab.a;
      labs[count * 3 + 2] = lab.b;
      rgbs[count * 3] = r;
      rgbs[count * 3 + 1] = g;
      rgbs[count * 3 + 2] = b;
      xs[count] = width > 1 ? x / (width - 1) : 0;
      ys[count] = height > 1 ? y / (height - 1) : 0;

      if (nativeCmyk) {
        cmyks[count * 4] = nativeCmyk[idx];
        cmyks[count * 4 + 1] = nativeCmyk[idx + 1];
        cmyks[count * 4 + 2] = nativeCmyk[idx + 2];
        cmyks[count * 4 + 3] = nativeCmyk[idx + 3];
      }

      meanLAccum += lab.l;
      count++;
    }
  }

  return {
    labs: count > 0 ? labs.subarray(0, count * 3) : labs,
    rgbs: count > 0 ? rgbs.subarray(0, count * 3) : rgbs,
    cmyks: count > 0 ? cmyks.subarray(0, count * 4) : cmyks,
    xs: count > 0 ? xs.subarray(0, count) : xs,
    ys: count > 0 ? ys.subarray(0, count) : ys,
    total: count,
    meanL: count > 0 ? meanLAccum / count : 50,
  };
}

function assignToCentroids(labs: Float64Array, centroids: Lab[]): number[][] {
  const n = labs.length / 3;
  const members: number[][] = centroids.map(() => []);

  for (let i = 0; i < n; i++) {
    const l = labs[i * 3];
    const a = labs[i * 3 + 1];
    const b = labs[i * 3 + 2];
    let best = Infinity;
    let bestC = 0;
    for (let j = 0; j < centroids.length; j++) {
      const dl = l - centroids[j].l;
      const da = a - centroids[j].a;
      const db = b - centroids[j].b;
      const d = dl * dl + da * da + db * db;
      if (d < best) {
        best = d;
        bestC = j;
      }
    }
    members[bestC].push(i);
  }

  return members;
}

function exactRgbForCluster(
  cluster: WeightedCluster,
  labs: Float64Array,
  rgbs: Uint8ClampedArray,
  cmyks: Uint8ClampedArray,
  xs: Float64Array,
  ys: Float64Array,
  hasNativeCmyk: boolean,
): { rgb: Rgb; cmyk: Cmyk | null; modePurity: number; x: number; y: number } {
  let best = Infinity;
  let bestRgb: Rgb = { r: 0, g: 0, b: 0 };
  let bestCmyk: Cmyk | null = null;
  let xSum = 0;
  let ySum = 0;

  const cmykCounts = new Map<string, { count: number; cmyk: Cmyk }>();
  const rgbCounts = new Map<string, number>();

  for (const idx of cluster.memberIndices) {
    const l = labs[idx * 3];
    const a = labs[idx * 3 + 1];
    const b = labs[idx * 3 + 2];
    const d =
      (l - cluster.centroid.l) ** 2 +
      (a - cluster.centroid.a) ** 2 +
      (b - cluster.centroid.b) ** 2;
    if (d < best) {
      best = d;
      bestRgb = {
        r: rgbs[idx * 3],
        g: rgbs[idx * 3 + 1],
        b: rgbs[idx * 3 + 2],
      };
    }
    const rgbKey = `${rgbs[idx * 3]},${rgbs[idx * 3 + 1]},${rgbs[idx * 3 + 2]}`;
    rgbCounts.set(rgbKey, (rgbCounts.get(rgbKey) ?? 0) + 1);
    xSum += xs[idx];
    ySum += ys[idx];
    if (hasNativeCmyk) {
      const c = cmyks[idx * 4];
      const m = cmyks[idx * 4 + 1];
      const y = cmyks[idx * 4 + 2];
      const k = cmyks[idx * 4 + 3];
      const key = `${c},${m},${y},${k}`;
      const entry = cmykCounts.get(key);
      if (entry) {
        entry.count++;
      } else {
        cmykCounts.set(key, {
          count: 1,
          cmyk: {
            c: Math.round((c / 255) * 100),
            m: Math.round((m / 255) * 100),
            y: Math.round((y / 255) * 100),
            k: Math.round((k / 255) * 100),
          },
        });
      }
    }
  }

  let modeCount = 0;
  if (hasNativeCmyk && cmykCounts.size > 0) {
    for (const { count, cmyk } of cmykCounts.values()) {
      if (count > modeCount) {
        modeCount = count;
        bestCmyk = cmyk;
      }
    }
  } else {
    for (const count of rgbCounts.values()) {
      if (count > modeCount) modeCount = count;
    }
  }

  const memberCount = cluster.memberIndices.length;

  return {
    rgb: bestRgb,
    cmyk: bestCmyk,
    modePurity: memberCount > 0 ? modeCount / memberCount : 0,
    x: memberCount > 0 ? xSum / memberCount : 0.5,
    y: memberCount > 0 ? ySum / memberCount : 0.5,
  };
}

function mergeClusters(clusters: WeightedCluster[]): WeightedCluster[] {
  const working = clusters.map((c) => ({ ...c, memberIndices: [...c.memberIndices] }));

  let changed = true;
  while (changed) {
    changed = false;

    let bestA = -1;
    let bestB = -1;
    let bestDist = Infinity;

    for (let i = 0; i < working.length; i++) {
      for (let j = i + 1; j < working.length; j++) {
        const d = deltaE2000(working[i].centroid, working[j].centroid);
        if (d < bestDist) {
          bestDist = d;
          bestA = i;
          bestB = j;
        }
      }
    }

    if (bestA === -1 || bestDist >= MERGE_DELTA_E_2000) break;

    const a = working[bestA];
    const b = working[bestB];
    const combinedSize = a.size + b.size;
    const centroid = {
      l: (a.centroid.l * a.size + b.centroid.l * b.size) / combinedSize,
      a: (a.centroid.a * a.size + b.centroid.a * b.size) / combinedSize,
      b: (a.centroid.b * a.size + b.centroid.b * b.size) / combinedSize,
    };
    const meanL = (a.meanL * a.size + b.meanL * b.size) / combinedSize;
    const meanChroma = (a.meanChroma * a.size + b.meanChroma * b.size) / combinedSize;

    const merged: WeightedCluster = {
      centroid,
      size: combinedSize,
      meanL,
      meanChroma,
      memberIndices: [...a.memberIndices, ...b.memberIndices],
    };

    working.splice(Math.max(bestA, bestB), 1);
    working.splice(Math.min(bestA, bestB), 1);
    working.push(merged);
    changed = true;
  }

  return working;
}

function scoreClusters(clusters: WeightedCluster[], mode: AnalysisOptions["mode"], meanL: number) {
  const maxSize = Math.max(...clusters.map((c) => c.size));

  return clusters.map((c) => {
    const area = c.size / maxSize;
    const chromaNorm = Math.min(1, c.meanChroma / 80);
    const contrast = 1 - Math.abs(c.meanL - meanL) / 100;

    let score: number;
    if (mode === "predominantes") {
      score = c.size;
    } else {
      score = 0.4 * area + 0.4 * chromaNorm + 0.2 * contrast;
    }

    return { cluster: c, score };
  });
}

export function analyzeImageData(
  imageData: ImageData,
  options: AnalysisOptions,
  onProgress?: ProgressFn,
  nativeCmyk?: Uint8Array | null,
): AnalysisResult {
  onProgress?.("Lendo pixels visíveis da imagem…");
  const { labs, rgbs, cmyks, xs, ys, total, meanL } = filterAndCollect(
    imageData,
    options,
    nativeCmyk,
  );

  if (total === 0) {
    throw new AnalysisError(
      "Nenhum pixel visível encontrado após aplicar os filtros. Verifique as opções de análise ou envie outra imagem.",
    );
  }

  onProgress?.("Agrupando tons semelhantes no espaço CIELAB…");
  const k = Math.min(CLUSTER_COUNT, total);
  const rawClusters = kmeansLab(labs, { k });
  const members = assignToCentroids(labs, rawClusters.map((c) => c.centroid));

  const weighted: WeightedCluster[] = rawClusters.map((c, i) => ({
    centroid: c.centroid,
    size: c.size,
    meanL: c.meanL,
    meanChroma: labChroma({ l: c.meanL, a: c.meanA, b: c.meanB }),
    memberIndices: members[i],
  }));

  onProgress?.("Mesclando cores visualmente próximas…");
  const merged = mergeClusters(weighted);

  const scored = scoreClusters(merged, options.mode, meanL);
  scored.sort((a, b) => b.score - a.score);

  const hasNativeCmyk = !!nativeCmyk;
  const withChroma = scored.map((item, index) => {
    const { rgb: rgbColor, cmyk, modePurity, x, y } = exactRgbForCluster(
      item.cluster,
      labs,
      rgbs,
      cmyks,
      xs,
      ys,
      hasNativeCmyk,
    );
    return {
      rank: index + 1,
      hex: rgbToHex(rgbColor),
      rgb: rgbColor,
      cmykApprox: rgbToCmykApprox(rgbColor),
      cmykPrint: cmyk,
      percentage: (item.cluster.size / total) * 100,
      score: item.score,
      name: "",
      chroma: labChroma(rgbToLab(rgbColor)),
      modePurity,
      x,
      y,
    };
  });

  const solid = withChroma.filter((c) => c.modePurity >= MIN_MODE_PURITY);
  const pool = solid.length > 0 ? solid : withChroma;

  const highlighted = pool.filter(
    (c) => c.percentage >= MIN_PREDOMINANCE_PERCENT || c.chroma >= MIN_DISTINCT_CHROMA,
  );

  const colors: DominantColor[] = (highlighted.length > 0 ? highlighted : pool.slice(0, 3)).map(
    (c, index) => ({
      rank: index + 1,
      hex: c.hex,
      rgb: c.rgb,
      cmykApprox: c.cmykApprox,
      cmykPrint: c.cmykPrint,
      percentage: c.percentage,
      score: c.score,
      modePurity: c.modePurity,
      name: c.name,
      x: c.x,
      y: c.y,
    }),
  );

  const profile = getIccProfile(options.iccProfileId);

  return {
    colors,
    mode: options.mode,
    options: { ...options },
    totalPixels: total,
    sampledPixels: total,
    profileName: profile.label,
    imageName: "",
    imageWidth: imageData.width,
    imageHeight: imageData.height,
  };
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

export const CMYK_DISCLAIMER =
  "Os valores CMYK exibidos na tela podem variar conforme o perfil ICC, o papel, a tinta, o equipamento e o processo de impressão. Para produção gráfica, utilize o perfil indicado pela gráfica.";
