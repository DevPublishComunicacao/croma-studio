import { readFileSync } from "node:fs";
import {
  initWasm,
  cmsCreate_sRGBProfile,
  cmsOpenProfileFromMem,
  cmsCreateTransform,
  cmsDoTransform,
  cmsCloseProfile,
  cmsDeleteTransform,
  CmsIntent,
} from "../node_modules/@kittl/little-cms/dist/littleCms.node.js";
import { TYPE_RGB_8, TYPE_CMYK_8 } from "../node_modules/@kittl/little-cms/dist/formats.js";
import {
  flagsUnion,
  FLAGS_BLACKPOINTCOMPENSATION,
  FLAGS_HIGHRESPRECALC,
} from "../node_modules/@kittl/little-cms/dist/flags.js";

await initWasm("D:/DESENVOLVIMENTO/layout-web/public/wasm/lcms.wasm");

const embedded = cmsOpenProfileFromMem(
  new Uint8Array(readFileSync("D:/DESENVOLVIMENTO/layout-web/.e2e/embedded.icc")),
).valueOrThrow;
const srgb = cmsCreate_sRGBProfile().valueOrThrow;

const t = cmsCreateTransform(
  srgb,
  TYPE_RGB_8,
  embedded,
  TYPE_CMYK_8,
  CmsIntent.RelativeColorimetric,
  flagsUnion(FLAGS_BLACKPOINTCOMPENSATION, FLAGS_HIGHRESPRECALC),
).valueOrThrow;

const input = new Uint8Array([48, 64, 104, 206, 122, 61]);
const out = cmsDoTransform(t, input, 2).valueOrThrow;
console.log("sRGB 48,64,104  -> embutido:", Array.from(out.slice(0, 4)).map((v) => Math.round((v / 255) * 100)));
console.log("sRGB 206,122,61 -> embutido:", Array.from(out.slice(4, 8)).map((v) => Math.round((v / 255) * 100)));

cmsDeleteTransform(t);
cmsCloseProfile(embedded);
cmsCloseProfile(srgb);
