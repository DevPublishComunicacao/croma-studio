import { getIccProfile } from "@/lib/color/iccProfiles";
import type { Cmyk, Rgb } from "@/lib/types";

type LcmsModule = typeof import("@kittl/little-cms");
type LcmsFormats = typeof import("@kittl/little-cms/formats");
type LcmsFlags = typeof import("@kittl/little-cms/flags");

let initialized = false;
let cache: {
  main: LcmsModule;
  formats: LcmsFormats;
  flags: LcmsFlags;
} | null = null;

const WASM_PATH = "/wasm/lcms.wasm";

async function loadLcms() {
  if (cache) return cache;
  const [main, formats, flags] = await Promise.all([
    import("@kittl/little-cms"),
    import("@kittl/little-cms/formats"),
    import("@kittl/little-cms/flags"),
  ]);
  if (!initialized) {
    await main.initWasm(WASM_PATH);
    initialized = true;
  }
  cache = { main, formats, flags };
  return cache;
}

async function fetchProfileBytes(profileId: string, customBuffer?: ArrayBuffer) {
  if (profileId === "custom") {
    if (!customBuffer || customBuffer.byteLength === 0) {
      throw new Error("Nenhum arquivo de perfil ICC foi enviado.");
    }
    return new Uint8Array(customBuffer);
  }
  const info = getIccProfile(profileId);
  if (!info.file) {
    throw new Error(`Perfil ICC não encontrado: ${profileId}`);
  }
  const response = await fetch(info.file);
  if (!response.ok) {
    throw new Error(`Falha ao carregar o perfil ${info.label}.`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export interface RgbToCmykConverter {
  readonly profileId: string;
  readonly profileLabel: string;
  readonly customName: string | null;
  convert(rgbColors: Rgb[]): Cmyk[];
  close(): void;
}

export async function createRgbToCmykConverter(
  profileId: string,
  customBuffer?: ArrayBuffer,
  customName?: string,
): Promise<RgbToCmykConverter> {
  const { main, formats, flags } = await loadLcms();
  const profileInfo = getIccProfile(profileId);

  const bytes = await fetchProfileBytes(profileId, customBuffer);
  const sRgbProfile = main.cmsCreate_sRGBProfile().valueOrThrow;
  const outputProfile = main.cmsOpenProfileFromMem(bytes).valueOrThrow;

  let transform;
  try {
    transform = main
      .cmsCreateTransform(
        sRgbProfile,
        formats.TYPE_RGB_8,
        outputProfile,
        formats.TYPE_CMYK_8,
        main.CmsIntent.RelativeColorimetric,
        flags.flagsUnion(
          flags.FLAGS_BLACKPOINTCOMPENSATION,
          flags.FLAGS_HIGHRESPRECALC,
        ),
      )
      .valueOrThrow;
  } finally {
    main.cmsCloseProfile(sRgbProfile);
    main.cmsCloseProfile(outputProfile);
  }

  let closed = false;

  return {
    profileId,
    profileLabel: profileInfo.label,
    customName: profileId === "custom" ? customName ?? null : null,
    convert(rgbColors: Rgb[]): Cmyk[] {
      if (closed) {
        throw new Error("Conversor CMYK já foi encerrado.");
      }
      if (rgbColors.length === 0) return [];
      const input = new Uint8Array(rgbColors.length * 3);
      rgbColors.forEach((rgb, i) => {
        input[i * 3] = rgb.r;
        input[i * 3 + 1] = rgb.g;
        input[i * 3 + 2] = rgb.b;
      });

      const output = main.cmsDoTransform(transform, input, rgbColors.length).valueOrThrow;

      const result: Cmyk[] = [];
      for (let i = 0; i < rgbColors.length; i++) {
        result.push({
          c: Math.round((output[i * 4] / 255) * 100),
          m: Math.round((output[i * 4 + 1] / 255) * 100),
          y: Math.round((output[i * 4 + 2] / 255) * 100),
          k: Math.round((output[i * 4 + 3] / 255) * 100),
        });
      }
      return result;
    },
    close() {
      if (!closed) {
        main.cmsDeleteTransform(transform);
        closed = true;
      }
    },
  };
}

export async function readProfileName(buffer: ArrayBuffer): Promise<string | null> {
  const { main } = await loadLcms();
  const profile = main.cmsOpenProfileFromMem(new Uint8Array(buffer)).valueOrThrow;
  const info = main
    .cmsGetProfileInfoASCII(
      profile,
      main.CmsPrintInfoType.Description,
      "en",
      "US",
    )
    .valueOrThrow;
  main.cmsCloseProfile(profile);
  return info.trim() || null;
}
