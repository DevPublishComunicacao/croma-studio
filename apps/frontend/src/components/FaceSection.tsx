"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

import { ErrorBanner } from "@/components/ErrorBanner";
import { ImagePreview } from "@/components/ImagePreview";
import { PaletteStrip } from "@/components/PaletteStrip";
import { ProcessingOverlay } from "@/components/ProcessingOverlay";
import { UploadZone } from "@/components/UploadZone";

import { AnalysisError, analyzeImageData, MAX_COLORS_PER_FACE } from "@/lib/color/analysis";
import { rgbToCmykApprox } from "@/lib/color/cmykApprox";
import { rgbToHex } from "@/lib/color/conversions";
import { imageDataToCmykDisplayDataUrl } from "@/lib/color/display";
import {
  CHIP_MARGIN,
  CHIP_PHYSICAL,
  computeChipOverlay,
} from "@/lib/export/approvalLayout";
import { ImageLoadError, loadImageFile } from "@/lib/image/loader";
import { decodeStoredNativeCmyk } from "@/lib/color/nativeCmyk";
import { saveRemoteFace } from "@/lib/api/client";
import type { RemoteFace } from "@/lib/api/client";
import type {
  AnalysisOptions,
  AnalysisResult,
  Cmyk,
  DominantColor,
  LoadedImage,
  PickerMode,
  Rgb,
} from "@/lib/types";
import type { PickedColor } from "@/components/ImagePreview";

export interface PunchState {
  type: PunchType | null;
  position: PunchPosition | null;
  quantity: PunchQuantity | null;
}

export interface FaceSectionHandle {
  getImage: () => LoadedImage | null;
  prepareExportData: () => Promise<void>;
  addImageFromImage: (source: LoadedImage) => void;
  addBlankFromImage: (source: LoadedImage) => void;
  getChip: () => ChipPosition | null;
  setChip: (position: ChipPosition | null) => void;
  getPunch: () => PunchState;
  setPunch: (punch: PunchState) => void;
  getExportData: () => {
    result: AnalysisResult;
    dataUrl: string;
    image: LoadedImage;
    side: "frente" | "verso";
  } | null;
}

interface FaceSectionProps {
  side: "frente" | "verso";
  jobId: string | null;
  initialFace: RemoteFace | null;
  title: string;
  options: AnalysisOptions;
  customIcc: { buffer: ArrayBuffer; name: string } | null;
  onAddRecipient?: () => void;
  onDuplicateImage?: () => void;
  onImageStateChange?: (hasImage: boolean) => void;
  onChipChange?: (position: ChipPosition | null) => void;
  onPunchChange?: (punch: PunchState) => void;
  onNewImage?: (previousChip: ChipPosition | null) => void;
  getOrientationConflict?: (width: number, height: number) => string | null;
  showAddRecipient?: boolean;
}

type Status = "idle" | "processing" | "done" | "error";
type CmykState = "idle" | "loading" | "ready" | "error";
type MagneticStripePosition =
  | "vertical-left"
  | "vertical-right"
  | "horizontal-top"
  | "horizontal-bottom";

const MAGNETIC_STRIPE_OPTIONS: Array<{
  value: MagneticStripePosition;
  label: string;
}> = [
  { value: "vertical-left", label: "Tarja magnética vertical esquerda" },
  { value: "vertical-right", label: "Tarja magnética vertical direita" },
  { value: "horizontal-top", label: "Tarja magnética horizontal superior" },
  { value: "horizontal-bottom", label: "Tarja magnética horizontal inferior" },
];

export type ChipPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

const CHIP_OPTIONS: Array<{ value: ChipPosition; label: string }> = [
  { value: "top-left", label: "Chip superior esquerdo" },
  { value: "top-right", label: "Chip superior direito" },
  { value: "bottom-left", label: "Chip inferior esquerdo" },
  { value: "bottom-right", label: "Chip inferior direito" },
];

export type PunchType = "ovoid" | "round";

export type PunchQuantity = "simple" | "double";

export type PunchPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

const PUNCH_TYPE_OPTIONS: Array<{ value: PunchType; label: string; hint: string }> = [
  { value: "ovoid", label: "Ovoide", hint: "18 × 4,5 mm · cantos arredondados" },
  { value: "round", label: "Redondo", hint: "7,5 mm de diâmetro" },
];

const PUNCH_QUANTITY_OPTIONS: Array<{ value: PunchQuantity; label: string }> = [
  { value: "simple", label: "Simples" },
  { value: "double", label: "Duplo" },
];

const PUNCH_OPTIONS: Array<{ value: PunchPosition; label: string }> = [
  { value: "top-left", label: "Esquerdo superior" },
  { value: "top-center", label: "Central superior" },
  { value: "top-right", label: "Direito superior" },
  { value: "middle-left", label: "Esquerdo meio" },
  { value: "middle-center", label: "Central meio" },
  { value: "middle-right", label: "Direito meio" },
  { value: "bottom-left", label: "Esquerdo inferior" },
  { value: "bottom-center", label: "Central inferior" },
  { value: "bottom-right", label: "Direito inferior" },
];

function cmykKey(color: PickedColor | DominantColor): string {
  const cmyk = "cmyk" in color
    ? color.cmyk ?? rgbToCmykApprox(color.rgb)
    : color.cmykPrint ?? color.cmykApprox;
  return `${cmyk.c}-${cmyk.m}-${cmyk.y}-${cmyk.k}`;
}

function MagneticStripeIcon({
  position,
  selected,
}: {
  position: MagneticStripePosition;
  selected: boolean;
}) {
  const vertical = position.startsWith("vertical");
  const start =
    position === "vertical-left"
      ? "M12 11v26"
      : position === "vertical-right"
        ? "M36 11v26"
        : position === "horizontal-top"
          ? "M13 12h22"
          : "M13 36h22";

  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-16 w-16" aria-hidden="true">
      <rect
        x="8"
        y="6"
        width="32"
        height="36"
        rx="5"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity={selected ? 0.9 : 0.55}
      />
      <path d={start} stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path
        d={vertical ? "M14 25h20M14 30h10" : "M18 14h12M18 34h8"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity=".25"
      />
    </svg>
  );
}

function ChipPositionIcon({
  position,
  selected,
}: {
  position: ChipPosition;
  selected: boolean;
}) {
  const chip = (x: number, y: number) => (
    <>
      <rect x={x} y={y} width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d={`M${x + 2.5} ${y}v-4M${x + 6} ${y}v-4M${x + 9.5} ${y}v-4M${x + 2.5} ${y + 12}v4M${x + 6} ${y + 12}v4M${x + 9.5} ${y + 12}v4M${x} ${y + 2.5}h-4M${x} ${y + 6}h-4M${x} ${y + 9.5}h-4M${x + 12} ${y + 2.5}h4M${x + 12} ${y + 6}h4M${x + 12} ${y + 9.5}h4`}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </>
  );

  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-16 w-16" aria-hidden="true">
      <rect
        x="8"
        y="6"
        width="32"
        height="36"
        rx="5"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity={selected ? 0.9 : 0.55}
      />
      {position === "top-left" && chip(12, 14)}
      {position === "top-right" && chip(24, 14)}
      {position === "bottom-left" && chip(12, 22)}
      {position === "bottom-right" && chip(24, 22)}
    </svg>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof AnalysisError || error instanceof ImageLoadError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Ocorreu um erro inesperado ao processar a imagem.";
}

function PunchPositionIcon({
  position,
  selected,
}: {
  position: PunchPosition;
  selected: boolean;
}) {
  const hole = (cx: number, cy: number) => (
    <circle cx={cx} cy={cy} r="3.2" fill="currentColor" />
  );

  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-16 w-16" aria-hidden="true">
      <rect
        x="8"
        y="6"
        width="32"
        height="36"
        rx="5"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity={selected ? 0.9 : 0.55}
      />
      {position === "top-left" && hole(17, 16)}
      {position === "top-center" && hole(24, 16)}
      {position === "top-right" && hole(31, 16)}
      {position === "middle-left" && hole(17, 24)}
      {position === "middle-center" && hole(24, 24)}
      {position === "middle-right" && hole(31, 24)}
      {position === "bottom-left" && hole(17, 32)}
      {position === "bottom-center" && hole(24, 32)}
      {position === "bottom-right" && hole(31, 32)}
    </svg>
  );
}

export const FaceSection = forwardRef<FaceSectionHandle, FaceSectionProps>(function FaceSection(
  {
    side,
    jobId,
    initialFace,
    title,
    options,
    customIcc,
    onAddRecipient,
    onDuplicateImage,
    onImageStateChange,
    onChipChange,
    onPunchChange,
    onNewImage,
    getOrientationConflict,
    showAddRecipient,
  },
  ref,
) {
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [, setCmykState] = useState<CmykState>("idle");
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);
  const [mergeMode, setMergeMode] = useState<PickerMode | null>(null);
  const [pickedColors, setPickedColors] = useState<DominantColor[]>([]);
  const [stripeDialogOpen, setStripeDialogOpen] = useState(false);
  const [magneticStripePosition, setMagneticStripePosition] =
    useState<MagneticStripePosition | null>(null);
  const magneticStripeRef = useRef<MagneticStripePosition | null>(null);
  const [chipDialogOpen, setChipDialogOpen] = useState(false);
  const [chipPosition, setChipPosition] = useState<ChipPosition | null>(null);
  const [chipDisplaceConfirm, setChipDisplaceConfirm] = useState<ChipPosition | null>(null);
  const [orientationWarning, setOrientationWarning] = useState<string | null>(null);
  const chipRef = useRef<ChipPosition | null>(null);
  const lastChipRef = useRef<ChipPosition | null>(null);
  const [punchDialogOpen, setPunchDialogOpen] = useState(false);
  const [punchType, setPunchType] = useState<PunchType | null>(null);
  const [punchPosition, setPunchPosition] = useState<PunchPosition | null>(null);
  const [punchQuantity, setPunchQuantity] = useState<PunchQuantity | null>(null);
  const punchTypeRef = useRef<PunchType | null>(null);
  const punchPositionRef = useRef<PunchPosition | null>(null);
  const punchQuantityRef = useRef<PunchQuantity | null>(null);

  const optionsRef = useRef(options);
  const imageRef = useRef<LoadedImage | null>(null);
  const blankRecipientRef = useRef(false);
  const resultRef = useRef<AnalysisResult | null>(null);
  const customIccRef = useRef(customIcc);
  const pickedRef = useRef<DominantColor[]>([]);
  const mergeRef = useRef<PickerMode | null>(null);
  const generationRef = useRef(0);
  const converterRef = useRef<{
    key: string;
    close: () => void;
    convert: (rgbColors: Rgb[]) => Cmyk[];
  } | null>(null);
  const hydratedFaceRef = useRef<string | null>(null);
  const initialFacePendingRef = useRef(false);
  const storedFaceRef = useRef(false);
  const previousOptionsRef = useRef(options);

  useEffect(() => {
    const savedOptions = initialFace?.options ?? initialFace?.analysis.options;
    const savedOptionsMatch = savedOptions
      ? savedOptions.mode === options.mode &&
        savedOptions.ignoreWhite === options.ignoreWhite &&
        savedOptions.ignoreBlack === options.ignoreBlack &&
        savedOptions.ignoreGrays === options.ignoreGrays &&
        savedOptions.ignoreTransparentBackground === options.ignoreTransparentBackground &&
        savedOptions.iccProfileId === options.iccProfileId
      : false;

    if (previousOptionsRef.current !== options && hydratedFaceRef.current && !savedOptionsMatch) {
      hydratedFaceRef.current = null;
      storedFaceRef.current = false;
    }
    previousOptionsRef.current = options;
    optionsRef.current = options;
    customIccRef.current = customIcc;
  }, [customIcc, initialFace, options]);

  useEffect(() => {
    if (!initialFace || hydratedFaceRef.current === initialFace.id) return;
    const face = initialFace;
    let cancelled = false;
    initialFacePendingRef.current = true;

    async function hydrateFace() {
      try {
        const source = new Image();
        source.src = face.previewDataUrl;
        await new Promise<void>((resolve, reject) => {
          source.onload = () => resolve();
          source.onerror = () => reject(new Error("Não foi possível restaurar a imagem salva."));
        });
        if (cancelled) return;

        const canvas = document.createElement("canvas");
        canvas.width = face.imageWidth;
        canvas.height = face.imageHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Não foi possível restaurar a imagem salva.");
        context.drawImage(source, 0, 0, canvas.width, canvas.height);

        const restoredNativeCmyk = face.nativeCmyk ? decodeStoredNativeCmyk(face.nativeCmyk) : null;
        const restoredImage: LoadedImage = {
          fileName: face.imageName,
          format: face.format,
          width: face.imageWidth,
          height: face.imageHeight,
          imageData: context.getImageData(0, 0, canvas.width, canvas.height),
          previewUrl: face.previewDataUrl,
          previewUrlShared: true,
          nativeCmyk: restoredNativeCmyk,
          hasNativeCmyk: restoredNativeCmyk != null,
        };
        const restoredResult: AnalysisResult = {
          ...face.analysis,
          colors: (face.colors.length > 0 ? face.colors : face.analysis.colors)
            .slice(0, MAX_COLORS_PER_FACE)
            .map((color) => ({ ...color, hex: rgbToHex(color.rgb) })),
        };

        hydratedFaceRef.current = face.id;
        storedFaceRef.current = true;
        imageRef.current = restoredImage;
        resultRef.current = restoredResult;
        blankRecipientRef.current = restoredImage.fileName.endsWith("-recipiente.png");
        magneticStripeRef.current = restoredResult.magneticStripePosition as MagneticStripePosition | undefined ?? null;
        chipRef.current = restoredResult.chipPosition as ChipPosition | undefined ?? null;
        punchTypeRef.current = restoredResult.punchType as PunchType | undefined ?? null;
        punchPositionRef.current = restoredResult.punchPosition as PunchPosition | undefined ?? null;
        punchQuantityRef.current = restoredResult.punchQuantity as PunchQuantity | undefined ?? null;
        setImage(restoredImage);
        setResult(restoredResult);
        setMagneticStripePosition(magneticStripeRef.current);
        setChipPosition(chipRef.current);
        setPunchType(punchTypeRef.current);
        setPunchPosition(punchPositionRef.current);
        setPunchQuantity(punchQuantityRef.current);
        setStatus("done");
        setProgress("");
        setError(null);
        initialFacePendingRef.current = false;
      } catch (err) {
        if (!cancelled) {
          initialFacePendingRef.current = false;
          setStatus("error");
          setError(errorMessage(err));
        }
      }
    }

    void hydrateFace();
    return () => {
      cancelled = true;
    };
  }, [initialFace]);

  const convertColors = useCallback(
    async (colors: DominantColor[], opts: AnalysisOptions): Promise<DominantColor[]> => {
      if (colors.every((c) => c.cmykPrint != null)) return colors;

      const custom = customIccRef.current;
      const key =
        opts.iccProfileId === "custom" ? `custom:${custom?.name ?? ""}` : opts.iccProfileId;

      if (opts.iccProfileId === "custom" && !custom) return colors;

      try {
        if (converterRef.current?.key !== key) {
          converterRef.current?.close();
          converterRef.current = null;
          const icc = await import("@/lib/color/icc");
          const converter = await icc.createRgbToCmykConverter(
            opts.iccProfileId,
            custom?.buffer,
            custom?.name,
          );
          converterRef.current = { key, ...converter };
        }

        const cmyks = converterRef.current.convert(colors.map((c) => c.rgb));
        return colors.map((color, index) =>
          color.cmykPrint ? color : { ...color, cmykPrint: cmyks[index] },
        );
      } catch {
        return colors;
      }
    },
    [],
  );

  const applyPrintCmyk = useCallback(
    async (current: AnalysisResult, opts: AnalysisOptions) => {
      const gen = generationRef.current;
      const custom = customIccRef.current;

      if (current.colors.every((c) => c.cmykPrint != null)) {
        setCmykState("ready");
        return;
      }

      if (opts.iccProfileId === "custom" && !custom) {
        setCmykState("idle");
        return;
      }

      setCmykState("loading");
      const updatedColors = await convertColors(current.colors, opts);

      if (gen !== generationRef.current) return;

      const updated = { ...current, colors: updatedColors };
      resultRef.current = updated;
      setResult(updated);
      setCmykState("ready");
    },
    [convertColors],
  );

  const runAnalysis = useCallback(
    async (img: LoadedImage, opts: AnalysisOptions) => {
      const gen = ++generationRef.current;
      setStatus("processing");
      setError(null);
      setCmykState("loading");
      pickedRef.current = [];
      setPickedColors([]);
      mergeRef.current = null;
      setMergeMode(null);
      setPickerMode(null);
      try {
        const res = analyzeImageData(img.imageData, opts, setProgress, img.nativeCmyk);
        res.imageName = img.fileName;
        res.imageWidth = img.width;
        res.imageHeight = img.height;
        res.magneticStripePosition = magneticStripeRef.current ?? undefined;
        res.chipPosition = chipRef.current ?? undefined;
        res.punchType = punchTypeRef.current ?? undefined;
        res.punchPosition = punchPositionRef.current ?? undefined;
        res.punchQuantity = punchQuantityRef.current ?? undefined;

        if (gen !== generationRef.current) return;
        resultRef.current = res;
        setResult(res);
        setStatus("done");
        setProgress("");

        await applyPrintCmyk(res, opts);
        if (jobId) void saveRemoteFace(jobId, side, img, resultRef.current ?? res);
      } catch (err) {
        if (gen !== generationRef.current) return;
        setStatus("error");
        setError(errorMessage(err));
        setProgress("");
      }
    },
    [applyPrintCmyk, jobId, side],
  );

  const handleFile = useCallback(
    async (file: File) => {
      ++generationRef.current;
      initialFacePendingRef.current = false;
      hydratedFaceRef.current = null;
      storedFaceRef.current = false;
      const previousChip = lastChipRef.current;
      setStatus("processing");
      setError(null);
      setProgress("");

      if (imageRef.current?.previewUrl.startsWith("blob:") && !imageRef.current.previewUrlShared) {
        URL.revokeObjectURL(imageRef.current.previewUrl);
      }

      try {
        const loaded = await loadImageFile(file, setProgress);
        const conflict = getOrientationConflict?.(loaded.width, loaded.height);
        if (conflict) {
          if (loaded.previewUrl.startsWith("blob:")) {
            URL.revokeObjectURL(loaded.previewUrl);
          }
          setOrientationWarning(conflict);
          setStatus("idle");
          setError(null);
          setProgress("");
          return;
        }
        blankRecipientRef.current = false;
        magneticStripeRef.current = null;
        setMagneticStripePosition(null);
        chipRef.current = null;
        setChipPosition(null);
        punchTypeRef.current = null;
        setPunchType(null);
        punchPositionRef.current = null;
        setPunchPosition(null);
        punchQuantityRef.current = null;
        setPunchQuantity(null);
        imageRef.current = loaded;
        setImage(loaded);
        await runAnalysis(loaded, optionsRef.current);
        onNewImage?.(previousChip);
      } catch (err) {
        setStatus("error");
        setError(errorMessage(err));
      }
    },
    [runAnalysis, getOrientationConflict],
  );

  const handleRemoveImage = useCallback(() => {
    ++generationRef.current;
    initialFacePendingRef.current = false;
    hydratedFaceRef.current = null;

    const currentImage = imageRef.current;
    if (currentImage?.previewUrl.startsWith("blob:") && !currentImage.previewUrlShared) {
      URL.revokeObjectURL(currentImage.previewUrl);
    }

    converterRef.current?.close();
    converterRef.current = null;
    imageRef.current = null;
    blankRecipientRef.current = false;
    storedFaceRef.current = false;
    magneticStripeRef.current = null;
    chipRef.current = null;
    punchTypeRef.current = null;
    punchPositionRef.current = null;
    punchQuantityRef.current = null;
    resultRef.current = null;
    pickedRef.current = [];
    mergeRef.current = null;

    setImage(null);
    setResult(null);
    setPickedColors([]);
    setPickerMode(null);
    setMergeMode(null);
    setMagneticStripePosition(null);
    setChipPosition(null);
    setPunchType(null);
    setPunchPosition(null);
    setPunchQuantity(null);
    setCmykState("idle");
    setStatus("idle");
    setProgress("");
    setError(null);
  }, []);

  const addBlankFromImage = useCallback(
    (source: LoadedImage) => {
      const canvas = document.createElement("canvas");
      canvas.width = source.width;
      canvas.height = source.height;
      const context = canvas.getContext("2d");
      if (!context) return;

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = "#000000";
      context.lineWidth = 1;
      const radius = Math.min(canvas.width, canvas.height) * 0.07;
      const inset = 1;
      context.beginPath();
      context.roundRect(
        inset,
        inset,
        Math.max(0, canvas.width - inset * 2),
        Math.max(0, canvas.height - inset * 2),
        Math.max(0, radius - inset),
      );
      context.stroke();

      const blank: LoadedImage = {
        fileName: `${source.fileName.replace(/\.[^.]+$/, "")}-recipiente.png`,
        format: "png",
        width: canvas.width,
        height: canvas.height,
        imageData: context.getImageData(0, 0, canvas.width, canvas.height),
        previewUrl: canvas.toDataURL("image/png"),
        nativeCmyk: null,
        hasNativeCmyk: false,
      };

      imageRef.current = blank;
      hydratedFaceRef.current = null;
      blankRecipientRef.current = true;
      initialFacePendingRef.current = false;
      storedFaceRef.current = false;
      const blankResult: AnalysisResult = {
        colors: [],
        mode: optionsRef.current.mode,
        options: optionsRef.current,
        totalPixels: canvas.width * canvas.height,
        sampledPixels: canvas.width * canvas.height,
        profileName: "Recipiente em branco",
        imageName: blank.fileName,
        imageWidth: blank.width,
        imageHeight: blank.height,
        magneticStripePosition: magneticStripeRef.current ?? undefined,
        chipPosition: chipRef.current ?? undefined,
        punchType: punchTypeRef.current ?? undefined,
        punchPosition: punchPositionRef.current ?? undefined,
        punchQuantity: punchQuantityRef.current ?? undefined,
      };
      resultRef.current = blankResult;
      setImage(blank);
      setResult(blankResult);
      setStatus("done");
      setProgress("");
      setError(null);
    },
    [],
  );

  const addImageFromImage = useCallback(
    (source: LoadedImage) => {
      const imageData = new ImageData(
        new Uint8ClampedArray(source.imageData.data),
        source.width,
        source.height,
      );
      source.previewUrlShared = true;

      const copy: LoadedImage = {
        ...source,
        fileName: `${source.fileName.replace(/\.[^.]+$/, "")}-copia.${source.format}`,
        imageData,
        previewUrl: source.previewUrl,
        previewUrlShared: true,
        nativeCmyk: source.nativeCmyk ? new Uint8Array(source.nativeCmyk) : null,
      };

      blankRecipientRef.current = false;
      initialFacePendingRef.current = false;
      hydratedFaceRef.current = null;
      storedFaceRef.current = false;
      magneticStripeRef.current = null;
      setMagneticStripePosition(null);
      chipRef.current = null;
      setChipPosition(null);
      punchTypeRef.current = null;
      setPunchType(null);
      punchPositionRef.current = null;
      setPunchPosition(null);
      punchQuantityRef.current = null;
      setPunchQuantity(null);
      imageRef.current = copy;
      setImage(copy);
      void runAnalysis(copy, optionsRef.current);
    },
    [runAnalysis],
  );

  useEffect(() => {
    onImageStateChange?.(Boolean(image));
  }, [image, onImageStateChange]);

  useEffect(() => {
    if (
      !imageRef.current ||
      blankRecipientRef.current ||
      initialFacePendingRef.current ||
      storedFaceRef.current ||
      (initialFace && hydratedFaceRef.current === initialFace.id)
    ) return;
    void runAnalysis(imageRef.current, options);
  }, [initialFace, options, runAnalysis]);

  useEffect(() => {
    if (
      blankRecipientRef.current ||
      initialFacePendingRef.current ||
      (initialFace && hydratedFaceRef.current === initialFace.id)
    ) return;
    if (resultRef.current) void applyPrintCmyk(resultRef.current, options);
    if (pickedRef.current.length > 0) {
      setCmykState("loading");
      void convertColors(pickedRef.current, options).then((updated) => {
        pickedRef.current = updated;
        setPickedColors(updated);
        setCmykState("ready");
      });
    }
  }, [applyPrintCmyk, convertColors, customIcc, initialFace, options]);

  const handleNameChange = useCallback((index: number, name: string) => {
    const base = resultRef.current;
    const picked = pickedRef.current;

    if (picked.length > 0 && mergeRef.current === "append" && base) {
      if (index < base.colors.length) {
        const updatedColors = base.colors.map((color, i) =>
          i === index ? { ...color, name } : color,
        );
        const updated = { ...base, colors: updatedColors };
        resultRef.current = updated;
        setResult(updated);
        return;
      }
      const pickedIndex = index - base.colors.length;
      const updated = picked.map((color, i) =>
        i === pickedIndex ? { ...color, name } : color,
      );
      pickedRef.current = updated;
      setPickedColors(updated);
      return;
    }

    if (picked.length > 0) {
      const updated = picked.map((color, i) =>
        i === index ? { ...color, name } : color,
      );
      pickedRef.current = updated;
      setPickedColors(updated);
      return;
    }

    if (!base) return;
    const updatedColors = base.colors.map((color, i) =>
      i === index ? { ...color, name } : color,
    );
    const updated = { ...base, colors: updatedColors };
    resultRef.current = updated;
    setResult(updated);
  }, []);

  const handleRemoveColor = useCallback((index: number) => {
    const base = resultRef.current;
    const picked = pickedRef.current;

    if (picked.length > 0 && mergeRef.current === "append" && base) {
      if (index < base.colors.length) {
        const updatedColors = base.colors.filter((_, i) => i !== index);
        const updated = { ...base, colors: updatedColors };
        resultRef.current = updated;
        setResult(updated);
        return;
      }
      const pickedIndex = index - base.colors.length;
      const updated = picked
        .filter((_, i) => i !== pickedIndex)
        .map((color, i) => ({ ...color, rank: i + 1 }));
      pickedRef.current = updated;
      setPickedColors(updated);
      return;
    }

    if (picked.length > 0) {
      const updated = picked
        .filter((_, i) => i !== index)
        .map((color, i) => ({ ...color, rank: i + 1 }));
      pickedRef.current = updated;
      setPickedColors(updated);
      return;
    }

    if (!base) return;
    const updatedColors = base.colors.filter((_, i) => i !== index);
    const updated = {
      ...base,
      colors: updatedColors.map((color, i) => ({ ...color, rank: i + 1 })),
    };
    resultRef.current = updated;
    setResult(updated);
  }, []);

  const handleTogglePicker = useCallback((mode: PickerMode) => {
    setPickerMode((prev) => (prev === mode ? null : mode));
  }, []);

  const handlePick = useCallback(
    (picked: PickedColor) => {
      const gen = generationRef.current;

      if (pickerMode) {
        mergeRef.current = pickerMode;
        setMergeMode(pickerMode);
      }

      const pickedKey = cmykKey(picked);
      const existing =
        pickedRef.current.some((c) => cmykKey(c) === pickedKey) ||
        (pickerMode === "append" &&
          resultRef.current?.colors.some((c) => cmykKey(c) === pickedKey));
      if (existing) return;

      const baseColorCount =
        pickerMode === "append" ? (resultRef.current?.colors.length ?? 0) : 0;
      if (baseColorCount + pickedRef.current.length >= MAX_COLORS_PER_FACE) {
        setError(
          `Cada face pode ter no máximo ${MAX_COLORS_PER_FACE} cores. Remova uma cor para adquirir outra.`,
        );
        return;
      }

      const color: DominantColor = {
        rank: pickedRef.current.length + 1,
        hex: picked.hex,
        rgb: picked.rgb,
        cmykApprox: rgbToCmykApprox(picked.rgb),
        cmykPrint: picked.cmyk ?? null,
        percentage: 0,
        score: 0,
        modePurity: 1,
        manual: true,
        name: "",
        x: picked.x,
        y: picked.y,
      };

      const next = [...pickedRef.current, color];
      pickedRef.current = next;
      setPickedColors(next);
      setError(null);

      if (!color.cmykPrint) {
        setCmykState("loading");
        void convertColors([color], optionsRef.current).then((converted) => {
          if (gen !== generationRef.current) return;
          const convertedColor = converted[0];
          const duplicate =
            pickedRef.current.some(
              (c) => c !== color && cmykKey(c) === cmykKey(convertedColor),
            ) ||
            (mergeRef.current === "append" &&
              resultRef.current?.colors.some(
                (c) => cmykKey(c) === cmykKey(convertedColor),
              ));
          const updated = duplicate
            ? pickedRef.current.filter((c) => c !== color)
            : pickedRef.current.map((c) => (c === color ? convertedColor : c));
          pickedRef.current = updated;
          setPickedColors(updated);
          setCmykState("ready");
        });
      }
    },
    [convertColors, pickerMode],
  );

  const applyChip = useCallback((position: ChipPosition | null) => {
    lastChipRef.current = position;
    chipRef.current = position;
    setChipPosition(position);
    if (resultRef.current) {
      const updated = { ...resultRef.current, chipPosition: position ?? undefined };
      resultRef.current = updated;
      setResult(updated);
    }
  }, []);

  const chipWouldDisplace = useCallback(
    (
      position: ChipPosition,
      punch: {
        type: PunchType | null;
        position: PunchPosition | null;
        quantity: PunchQuantity | null;
      },
      img: { width: number; height: number } | null,
    ): boolean => {
      if (!img || !punch.type || !punch.position) return false;
      const imgW = 85.5;
      const imgH = imgW * (img.height / Math.max(1, img.width));
      const overlay = computeChipOverlay(
        position,
        {
          punchType: punch.type,
          punchPosition: punch.position,
          punchQuantity: punch.quantity ?? "simple",
        },
        0,
        0,
        imgW,
        imgH,
        { chipSize: CHIP_PHYSICAL, margin: CHIP_MARGIN },
      );
      return overlay?.displaced ?? false;
    },
    [],
  );

  const applyChipSelection = useCallback((position: ChipPosition) => {
    chipRef.current = position;
    setChipPosition(position);
    onChipChange?.(position);
    if (resultRef.current) {
      const updated = {
        ...resultRef.current,
        chipPosition: position,
      };
      resultRef.current = updated;
      setResult(updated);
    }
  }, [onChipChange]);

  const applyPunch = useCallback((punch: PunchState) => {
    punchTypeRef.current = punch.type;
    setPunchType(punch.type);
    punchPositionRef.current = punch.position;
    setPunchPosition(punch.position);
    punchQuantityRef.current = punch.quantity;
    setPunchQuantity(punch.quantity);
    if (resultRef.current) {
      const updated = {
        ...resultRef.current,
        punchType: punch.type ?? undefined,
        punchPosition: punch.position ?? undefined,
        punchQuantity: punch.quantity ?? undefined,
      };
      resultRef.current = updated;
      setResult(updated);
    }
  }, []);

  const prepareExportData = useCallback(async () => {
    const current = resultRef.current;
    if (current) await applyPrintCmyk(current, optionsRef.current);

    const manual = pickedRef.current;
    if (manual.length === 0 || manual.every((color) => color.cmykPrint != null)) return;

    setCmykState("loading");
    const updated = await convertColors(manual, optionsRef.current);
    pickedRef.current = updated;
    setPickedColors(updated);
    setCmykState("ready");
  }, [applyPrintCmyk, convertColors]);

  useImperativeHandle(
    ref,
    () => ({
      getImage: () => imageRef.current,
      prepareExportData,
      addImageFromImage,
      addBlankFromImage,
      getChip: () => chipRef.current,
      setChip: applyChip,
      getPunch: () => ({
        type: punchTypeRef.current,
        position: punchPositionRef.current,
        quantity: punchQuantityRef.current,
      }),
      setPunch: applyPunch,
      getExportData: () => {
        const currentResult = resultRef.current;
        const currentImage = imageRef.current;
        if (!currentResult || !currentImage) return null;

        const manualColors = pickedRef.current;
        const colors =
          manualColors.length > 0 && mergeRef.current === "append"
            ? [...currentResult.colors, ...manualColors]
            : manualColors.length > 0
              ? manualColors
              : currentResult.colors;

        return {
          result: { ...currentResult, colors },
          dataUrl: imageDataToCmykDisplayDataUrl(currentImage.imageData),
          image: currentImage,
          side,
        };
      },
    }),
    [addBlankFromImage, addImageFromImage, applyChip, applyPunch, prepareExportData, side],
  );

  const processing = status === "processing";

  const handleRemoveStripe = () => {
    magneticStripeRef.current = null;
    setMagneticStripePosition(null);
    if (resultRef.current) {
      const updated = { ...resultRef.current, magneticStripePosition: undefined };
      resultRef.current = updated;
      setResult(updated);
    }
    setStripeDialogOpen(false);
  };

  const handleRemoveChip = () => {
    lastChipRef.current = null;
    chipRef.current = null;
    setChipPosition(null);
    onChipChange?.(null);
    if (resultRef.current) {
      const updated = { ...resultRef.current, chipPosition: undefined };
      resultRef.current = updated;
      setResult(updated);
    }
    setChipDialogOpen(false);
  };

  const handleRemovePunch = () => {
    punchTypeRef.current = null;
    setPunchType(null);
    punchPositionRef.current = null;
    setPunchPosition(null);
    punchQuantityRef.current = null;
    setPunchQuantity(null);
    onPunchChange?.({ type: null, position: null, quantity: null });
    if (resultRef.current) {
      const updated = {
        ...resultRef.current,
        punchType: undefined,
        punchPosition: undefined,
        punchQuantity: undefined,
      };
      resultRef.current = updated;
      setResult(updated);
    }
    setPunchDialogOpen(false);
  };

  const displayColors: DominantColor[] = result
    ? pickedColors.length > 0 && mergeMode === "append"
      ? [...result.colors, ...pickedColors]
      : pickedColors.length > 0
        ? pickedColors
        : result.colors
    : [];

  const manualCount = pickedColors.length;
  const isManual = manualCount > 0;
  const isAppend = isManual && mergeMode === "append";

  useEffect(() => {
    if (!jobId || !imageRef.current || !result || initialFacePendingRef.current) return;
    const manualColors = pickedRef.current;
    const colors =
      manualColors.length > 0 && mergeMode === "append"
        ? [...result.colors, ...manualColors]
        : manualColors.length > 0
          ? manualColors
          : result.colors;
    if (colors.some((color) => color.cmykPrint == null) && colors.length > 0) return;
    void saveRemoteFace(jobId, side, imageRef.current, { ...result, colors });
  }, [jobId, mergeMode, pickedColors, result, side]);

  const isVerticalImage = image ? image.height > image.width : false;
  const isHorizontalImage = image ? image.width > image.height : false;
  const isStripeAllowed = (value: MagneticStripePosition) => {
    if (isVerticalImage && value.startsWith("horizontal")) return false;
    if (isHorizontalImage && value.startsWith("vertical")) return false;
    return true;
  };

  const chipConflictsWithStripe = (
    chip: ChipPosition,
    stripe: MagneticStripePosition | null,
  ): boolean => {
    if (!stripe) return false;
    const chipOnTop = chip === "top-left" || chip === "top-right";
    const chipOnBottom = chip === "bottom-left" || chip === "bottom-right";
    const chipOnLeft = chip === "top-left" || chip === "bottom-left";
    const chipOnRight = chip === "top-right" || chip === "bottom-right";
    switch (stripe) {
      case "vertical-left":
        return chipOnLeft;
      case "vertical-right":
        return chipOnRight;
      case "horizontal-top":
        return chipOnTop;
      case "horizontal-bottom":
        return chipOnBottom;
      default:
        return false;
    }
  };

  const punchConflictsWithStripe = (
    position: PunchPosition,
    stripe: MagneticStripePosition | null,
  ): boolean => {
    if (!stripe) return false;
    const punchOnTop =
      position === "top-left" || position === "top-center" || position === "top-right";
    const punchOnBottom =
      position === "bottom-left" || position === "bottom-center" || position === "bottom-right";
    const punchOnLeft =
      position === "top-left" || position === "middle-left" || position === "bottom-left";
    const punchOnRight =
      position === "top-right" || position === "middle-right" || position === "bottom-right";
    switch (stripe) {
      case "vertical-left":
        return punchOnLeft;
      case "vertical-right":
        return punchOnRight;
      case "horizontal-top":
        return punchOnTop;
      case "horizontal-bottom":
        return punchOnBottom;
      default:
        return false;
    }
  };

  const isPunchPositionAllowed = (position: PunchPosition) => {
    if ((punchQuantity ?? "simple") === "double") {
      if (position !== "top-center" && position !== "bottom-center") return false;
    }
    return !punchConflictsWithStripe(position, magneticStripePosition);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between rounded-t-2xl border-b border-slate-200 bg-slate-800 px-5 py-3">
        <h2 className="text-sm font-bold uppercase tracking-widest text-white">{title}</h2>
        {image ? (
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="h-7 w-16 shrink-0 rounded-md border border-white/15 bg-white/5"
            >
              <button
                type="button"
                onClick={() => setPunchDialogOpen(true)}
                aria-label="Adicionar furação"
                title={
                  punchType && punchPosition
                    ? "Alterar a furação"
                    : "Adicionar furação"
                }
                className={`flex h-full w-full items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/90 ${
                  punchType && punchPosition
                    ? "bg-sky-400/30 text-sky-200 hover:bg-sky-400/45"
                    : "text-slate-300 hover:bg-white/10 hover:text-sky-200"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
                </svg>
              </button>
            </span>
            <span
              className="h-7 w-16 shrink-0 rounded-md border border-white/15 bg-white/5"
            >
              <button
                type="button"
                onClick={() => setStripeDialogOpen(true)}
                aria-label="Adicionar tarja magnética"
                title={
                  magneticStripePosition
                    ? "Alterar posição da tarja magnética"
                    : "Adicionar tarja magnética"
                }
                className={`flex h-full w-full items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/90 ${
                  magneticStripePosition
                    ? "bg-amber-400/30 text-amber-200 hover:bg-amber-400/45"
                    : "text-slate-300 hover:bg-white/10 hover:text-amber-200"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M3 9h18M7 15h4" strokeLinecap="round" />
                </svg>
              </button>
            </span>
            <span
              className="h-7 w-16 shrink-0 rounded-md border border-white/15 bg-white/5"
            >
              <button
                type="button"
                onClick={() => setChipDialogOpen(true)}
                aria-label="Adicionar chip RFID"
                title={
                  chipPosition
                    ? "Alterar posição do chip"
                    : "Adicionar chip RFID"
                }
                className={`flex h-full w-full items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/90 ${
                  chipPosition
                    ? "bg-emerald-400/30 text-emerald-200 hover:bg-emerald-400/45"
                    : "text-slate-300 hover:bg-white/10 hover:text-emerald-200"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <rect x="8" y="8" width="8" height="8" rx="1.5" />
                  <path
                    d="M10.5 8V4.5M13.5 8V4.5M10.5 19.5V16M13.5 19.5V16M8 10.5H4.5M8 13.5H4.5M19.5 10.5H16M19.5 13.5H16"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </span>
            {showAddRecipient && (
              <button
                type="button"
                onClick={onDuplicateImage}
                className="shrink-0 rounded-md border border-emerald-300/50 bg-emerald-500/20 px-2 py-1 text-[11px] font-semibold text-emerald-100 transition-colors hover:border-emerald-200/70 hover:bg-emerald-500/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/80"
              >
                Duplicar Imagem
              </button>
            )}
            <button
              type="button"
              onClick={handleRemoveImage}
              className="shrink-0 rounded-md border border-rose-300/50 bg-rose-500/20 px-2 py-1 text-[11px] font-semibold text-rose-100 transition-colors hover:border-rose-200/70 hover:bg-rose-500/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200/80"
            >
              Remover Imagem
            </button>
            {showAddRecipient && (
              <button
                type="button"
                onClick={onAddRecipient}
                className="shrink-0 rounded-md border border-sky-300/50 bg-sky-500/20 px-2 py-1 text-[11px] font-semibold text-sky-100 transition-colors hover:border-sky-200/70 hover:bg-sky-500/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/80"
              >
                Adicionar Layout
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div className="p-5">
        {error && !processing && (
          <div className="mb-4">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        {!image ? (
          <div className="relative">
            <UploadZone onFile={handleFile} busy={processing} />
            {processing && (
              <ProcessingOverlay title="Processando imagem…" step={progress} />
            )}
          </div>
        ) : (
          <div className="relative space-y-5">
            {status === "error" && error && (
              <ErrorBanner message={error} onDismiss={() => setError(null)} />
            )}

            {result ? (
              <>
                <div className="grid items-start gap-5 md:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
                    <ImagePreview
                      image={image}
                      magneticStripePosition={magneticStripePosition}
                      chipPosition={chipPosition}
                    punchType={punchType}
                    punchPosition={punchPosition}
                    punchQuantity={punchQuantity}
                    pickerMode={pickerMode}
                    savedColors={result?.colors}
                    onTogglePicker={handleTogglePicker}
                    onPick={handlePick}
                  />

                  <div className="flex flex-col gap-4">
                    <div>
                      <h3 className="text-base font-bold tracking-tight text-slate-900">
                        {isManual ? "Paleta de cores" : "Paleta identificada"}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {isManual
                          ? isAppend
                            ? `${displayColors.length} cor(es) na paleta (${result.colors.length} automáticas + ${manualCount} do conta-gotas)`
                            : `${manualCount} cor(es) selecionadas com o conta-gotas`
                          : `${result.colors.length} cor(es) entre ${result.sampledPixels.toLocaleString("pt-BR")} pixels amostrados · ${
                              result.mode === "predominantes"
                                ? "por área ocupada"
                                : "por destaque visual"
                            }`}
                      </p>
                    </div>
                    <PaletteStrip
                      colors={displayColors}
                      onRemove={handleRemoveColor}
                      onNameChange={handleNameChange}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="relative flex min-h-[320px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
                <ProcessingOverlay title="Analisando imagem…" step={progress} />
              </div>
            )}

            {processing && result && (
              <ProcessingOverlay title="Reanalisando…" step={progress} />
            )}
          </div>
        )}
      </div>

      {stripeDialogOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setStripeDialogOpen(false);
          }}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.25)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${title.replace(/\s+/g, "-").toLowerCase()}-stripe-title`}
          >
            <div className="relative overflow-hidden border-b border-slate-100 px-6 py-5">
              <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-amber-200/45 blur-3xl" />
              <div className="relative flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-600">
                  Acabamento magnético · {title}
                </p>
                <h3
                  id={`${title.replace(/\s+/g, "-").toLowerCase()}-stripe-title`}
                  className="mt-1 text-xl font-bold tracking-tight text-slate-900"
                >
                  Adicionar tarja magnética
                </h3>
                <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
                  {isVerticalImage
                    ? "Imagem vertical: apenas tarjas verticais são compatíveis."
                    : isHorizontalImage
                      ? "Imagem horizontal: apenas tarjas horizontais são compatíveis."
                      : "Escolha a orientação da tarja para este layout."}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={handleRemoveStripe}
                  disabled={!magneticStripePosition}
                  className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 transition-colors hover:border-rose-300 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Remover tarja
                </button>
                <button
                  type="button"
                  onClick={() => setStripeDialogOpen(false)}
                  aria-label="Fechar seleção de tarja magnética"
                  className="rounded-xl border border-slate-200 p-2 text-slate-400 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
                    <path strokeLinecap="round" d="M6 6l12 12M18 6L6 12" />
                  </svg>
                </button>
              </div>
            </div>
            </div>

            <div className="grid gap-3 p-6 sm:grid-cols-2">
              {MAGNETIC_STRIPE_OPTIONS.map((option) => {
                const orientationBlocked = !isStripeAllowed(option.value);
                const chipConflict = chipPosition
                  ? chipConflictsWithStripe(chipPosition, option.value)
                  : false;
                const punchConflict =
                  punchPosition && punchType
                    ? punchConflictsWithStripe(punchPosition, option.value)
                    : false;
                const doublePunchBlocked = (punchQuantity ?? "simple") === "double";
                const allowed =
                  !orientationBlocked && !chipConflict && !punchConflict && !doublePunchBlocked;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={!allowed}
                    onClick={() => {
                      magneticStripeRef.current = option.value;
                      setMagneticStripePosition(option.value);
                      if (chipPosition && chipConflictsWithStripe(chipPosition, option.value)) {
                        chipRef.current = null;
                        setChipPosition(null);
                        onChipChange?.(null);
                      }
                      if (punchPosition && punchConflictsWithStripe(punchPosition, option.value)) {
                        punchTypeRef.current = null;
                        setPunchType(null);
                        punchPositionRef.current = null;
                        setPunchPosition(null);
                        punchQuantityRef.current = null;
                        setPunchQuantity(null);
                        onPunchChange?.({ type: null, position: null, quantity: null });
                      }
                      if (resultRef.current) {
                        const updated = {
                          ...resultRef.current,
                          magneticStripePosition: option.value,
                          ...(chipRef.current
                            ? {}
                            : { chipPosition: undefined }),
                          ...(punchPositionRef.current
                            ? {}
                            : {
                                punchType: undefined,
                                punchPosition: undefined,
                                punchQuantity: undefined,
                              }),
                        };
                        resultRef.current = updated;
                        setResult(updated);
                      }
                      setStripeDialogOpen(false);
                    }}
                    title={
                      orientationBlocked
                        ? "Orientação incompatível com esta imagem"
                        : doublePunchBlocked
                          ? "Remova a furação dupla para adicionar tarja magnética"
                          : chipConflict
                            ? "Lado ocupado pelo chip"
                            : punchConflict
                              ? "Sobre a área da furação"
                              : undefined
                    }
                    className={`group flex min-h-36 flex-col items-center justify-between rounded-2xl border p-4 text-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-40 ${
                      magneticStripePosition === option.value
                        ? "border-amber-400 bg-amber-50 text-amber-800 shadow-[0_0_0_1px_rgba(245,158,11,0.15)]"
                        : "border-slate-200 bg-slate-50 text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800"
                    }`}
                  >
                    <span className="text-amber-600 transition-transform group-hover:scale-105">
                      <MagneticStripeIcon
                        position={option.value}
                        selected={magneticStripePosition === option.value}
                      />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-[0.08em]">
                      {option.label.replace("Tarja magnética ", "")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {chipDialogOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setChipDialogOpen(false);
          }}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.25)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${title.replace(/\s+/g, "-").toLowerCase()}-chip-title`}
          >
            <div className="relative overflow-hidden border-b border-slate-100 px-6 py-5">
              <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-emerald-200/45 blur-3xl" />
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-600">
                    Acabamento de chip · {title}
                  </p>
                  <h3
                    id={`${title.replace(/\s+/g, "-").toLowerCase()}-chip-title`}
                    className="mt-1 text-xl font-bold tracking-tight text-slate-900"
                  >
                    Adicionar chip
                  </h3>
                  <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
                    Escolha a posição do chip para este layout.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRemoveChip}
                    disabled={!chipPosition}
                    className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 transition-colors hover:border-rose-300 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Remover chip
                  </button>
                  <button
                    type="button"
                    onClick={() => setChipDialogOpen(false)}
                    aria-label="Fechar seleção de chip"
                    className="rounded-xl border border-slate-200 p-2 text-slate-400 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
                      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-3 p-6 sm:grid-cols-2">
              {CHIP_OPTIONS.map((option) => {
                const conflict = chipConflictsWithStripe(option.value, magneticStripePosition);
                const punchConflict = chipWouldDisplace(
                  option.value,
                  { type: punchType, position: punchPosition, quantity: punchQuantity },
                  image,
                );
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={conflict}
                    onClick={() => {
                      if (punchConflict) {
                        setChipDisplaceConfirm(option.value);
                        return;
                      }
                      applyChipSelection(option.value);
                      setChipDialogOpen(false);
                    }}
                    title={
                      conflict
                        ? "Lado ocupado pela tarja magnética"
                        : punchConflict
                          ? "O chip será deslocado verticalmente para não sobrepor a furação"
                          : undefined
                    }
                    className={`group flex min-h-36 flex-col items-center justify-between rounded-2xl border p-4 text-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-40 ${
                      chipPosition === option.value
                        ? "border-emerald-400 bg-emerald-50 text-emerald-800 shadow-[0_0_0_1px_rgba(16,185,129,0.15)]"
                        : "border-slate-200 bg-slate-50 text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
                    }`}
                  >
                    <span className="text-emerald-600 transition-transform group-hover:scale-105">
                      <ChipPositionIcon
                        position={option.value}
                        selected={chipPosition === option.value}
                      />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-[0.08em]">
                      {option.label.replace("Chip ", "")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {chipDisplaceConfirm && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setChipDisplaceConfirm(null);
          }}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.25)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${title.replace(/\s+/g, "-").toLowerCase()}-chip-displace-title`}
          >
            <div className="relative overflow-hidden border-b border-slate-100 px-6 py-5">
              <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-emerald-200/45 blur-3xl" />
              <div className="relative">
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-600">
                  Acabamento de chip · {title}
                </p>
                <h3
                  id={`${title.replace(/\s+/g, "-").toLowerCase()}-chip-displace-title`}
                  className="mt-1 text-xl font-bold tracking-tight text-slate-900"
                >
                  Chip sobre a furação
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  A posição escolhida para o chip coincide com a furação deste layout. O chip será
                  deslocado verticalmente para não sobrepor o furo.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6">
              <button
                type="button"
                onClick={() => setChipDisplaceConfirm(null)}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const position = chipDisplaceConfirm;
                  applyChipSelection(position);
                  setChipDisplaceConfirm(null);
                  setChipDialogOpen(false);
                }}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {punchDialogOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPunchDialogOpen(false);
          }}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.25)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${title.replace(/\s+/g, "-").toLowerCase()}-punch-title`}
          >
            <div className="relative overflow-hidden border-b border-slate-100 px-6 py-5">
              <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-sky-200/45 blur-3xl" />
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-sky-600">
                    Acabamento de furação · {title}
                  </p>
                  <h3
                    id={`${title.replace(/\s+/g, "-").toLowerCase()}-punch-title`}
                    className="mt-1 text-xl font-bold tracking-tight text-slate-900"
                  >
                    Adicionar furação
                  </h3>
                  <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
                    Escolha o tipo e a posição do furo. Todos os furos são adicionados com 4mm de
                    cada borda especificada.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRemovePunch}
                    disabled={!punchType || !punchPosition}
                    className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 transition-colors hover:border-rose-300 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Remover furação
                  </button>
                  <button
                    type="button"
                    onClick={() => setPunchDialogOpen(false)}
                    aria-label="Fechar seleção de furação"
                    className="rounded-xl border border-slate-200 p-2 text-slate-400 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
                      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  TIPO
                </span>
                <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                  {PUNCH_TYPE_OPTIONS.map((option) => {
                    const active = (punchType ?? "ovoid") === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setPunchType(option.value)}
                        className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${
                          active
                            ? "bg-white text-sky-700 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        <span
                          className={`block h-2.5 w-2.5 ${
                            option.value === "round" ? "rounded-full" : "rounded-sm"
                          } border border-current bg-white`}
                          aria-hidden="true"
                        />
                        {option.label}
                        <span className="hidden font-normal text-slate-400 sm:inline">
                          {option.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mb-4 flex flex-wrap items-center gap-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  QUANTIDADE
                </span>
                <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                  {PUNCH_QUANTITY_OPTIONS.map((option) => {
                    const active = (punchQuantity ?? "simple") === option.value;
                    const doubleBlockedByStripe =
                      option.value === "double" && Boolean(magneticStripePosition);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={doubleBlockedByStripe}
                        onClick={() => {
                          setPunchQuantity(option.value);
                          if (
                            option.value === "double" &&
                            punchPosition &&
                            punchPosition !== "top-center" &&
                            punchPosition !== "bottom-center"
                          ) {
                            punchPositionRef.current = null;
                            setPunchPosition(null);
                          }
                        }}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-not-allowed disabled:opacity-40 ${
                          active
                            ? "bg-white text-sky-700 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {PUNCH_OPTIONS.map((option) => {
                  const blocked = !isPunchPositionAllowed(option.value);
                  const stripeBlocked = punchConflictsWithStripe(
                    option.value,
                    magneticStripePosition,
                  );
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={blocked}
                      onClick={() => {
                        punchTypeRef.current = punchType ?? "ovoid";
                        setPunchType(punchTypeRef.current);
                        punchPositionRef.current = option.value;
                        setPunchPosition(option.value);
                        punchQuantityRef.current = punchQuantity ?? "simple";
                        setPunchQuantity(punchQuantityRef.current);
                        onPunchChange?.({
                          type: punchTypeRef.current,
                          position: option.value,
                          quantity: punchQuantityRef.current,
                        });
                        if (resultRef.current) {
                          const updated = {
                            ...resultRef.current,
                            punchType: punchTypeRef.current,
                            punchPosition: option.value,
                            punchQuantity: punchQuantityRef.current,
                          };
                          resultRef.current = updated;
                          setResult(updated);
                        }
                        setPunchDialogOpen(false);
                      }}
                      title={
                        blocked
                          ? stripeBlocked
                            ? "Sobre a área da tarja magnética"
                            : "Disponível apenas para furação simples"
                          : undefined
                      }
                      className={`group flex min-h-28 flex-col items-center justify-between rounded-2xl border p-3 text-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-not-allowed disabled:opacity-40 ${
                        punchType && punchPosition === option.value
                          ? "border-sky-400 bg-sky-50 text-sky-800 shadow-[0_0_0_1px_rgba(14,165,233,0.15)]"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800"
                      }`}
                    >
                      <span className="text-sky-600 transition-transform group-hover:scale-105">
                        <PunchPositionIcon
                          position={option.value}
                          selected={punchType != null && punchPosition === option.value}
                        />
                      </span>
                      <span className="text-[11px] font-bold uppercase tracking-[0.06em]">
                        {option.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
      {orientationWarning && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOrientationWarning(null);
          }}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.25)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${title.replace(/\s+/g, "-").toLowerCase()}-orientation-title`}
          >
            <div className="relative overflow-hidden border-b border-slate-100 px-6 py-5">
              <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-amber-200/45 blur-3xl" />
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-600">
                    Atenção · {title}
                  </p>
                  <h3
                    id={`${title.replace(/\s+/g, "-").toLowerCase()}-orientation-title`}
                    className="mt-1 text-xl font-bold tracking-tight text-slate-900"
                  >
                    Orientação incompatível
                  </h3>
                  <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-600">
                    {orientationWarning}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOrientationWarning(null)}
                  aria-label="Fechar aviso de orientação"
                  className="rounded-xl border border-slate-200 p-2 text-slate-400 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
                    <path strokeLinecap="round" d="M6 6l12 12M18 6L6 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-6">
              <button
                type="button"
                onClick={() => setOrientationWarning(null)}
                className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-amber-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
