export type AnalysisMode = "predominantes" | "destaque";
export type PickerMode = "replace" | "append";

export interface AnalysisOptions {
  mode: AnalysisMode;
  ignoreWhite: boolean;
  ignoreBlack: boolean;
  ignoreGrays: boolean;
  ignoreTransparentBackground: boolean;
  iccProfileId: string;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Cmyk {
  c: number;
  m: number;
  y: number;
  k: number;
}

export interface Lab {
  l: number;
  a: number;
  b: number;
}

export interface DominantColor {
  rank: number;
  hex: string;
  rgb: Rgb;
  cmykApprox: Cmyk;
  cmykPrint: Cmyk | null;
  percentage: number;
  score: number;
  modePurity: number;
  manual?: boolean;
  name: string;
  x?: number;
  y?: number;
}

export interface IccProfileInfo {
  id: string;
  label: string;
  description: string;
  file: string | null;
}

export interface AnalysisResult {
  colors: DominantColor[];
  mode: AnalysisMode;
  options: AnalysisOptions;
  totalPixels: number;
  sampledPixels: number;
  profileName: string;
  imageName: string;
  imageWidth: number;
  imageHeight: number;
  magneticStripePosition?: string;
  chipPosition?: string;
  punchType?: string;
  punchPosition?: string;
  punchQuantity?: string;
}

export interface LoadedImage {
  fileName: string;
  format: string;
  width: number;
  height: number;
  imageData: ImageData;
  previewUrl: string;
  previewUrlShared?: boolean;
  nativeCmyk: Uint8Array | null;
  hasNativeCmyk: boolean;
}

export interface JobData {
  numeroPedido: string;
  sistema: string;
  vendedor: string;
  cliente: string;
  produto: string;
  material: string;
  tamanho: string;
  espessura: string;
  cores: string;
  tarjaMagnetica: boolean;
  tipoTarja: string;
  chipRfid: boolean;
  tipoChip: string;
  infrared: boolean;
  infraredCor: string;
  acabamento: string;
  observacoes: string;
}
