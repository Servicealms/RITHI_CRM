// ===========================================================================
// THE ON-DEVICE READER, AND THE CROP (report-date check, Phase A).
//
// Everything here runs in the browser. The reader is tesseract.js, served from
// the app's own /ocr/ folder (scripts/copy-ocr.mjs) and loaded only when it is
// first needed -- about 7 MB, once, then kept by the browser. The photo is
// read here, the box is cut out here, and nothing is sent anywhere: Phase A
// only SHOWS the box, so it can be checked before any reading service exists.
// ===========================================================================
import { findReportBox, type CropBox, type OcrLine } from './reportCrop';

type TesseractWorker = {
  recognize: (img: HTMLCanvasElement, opts?: object, out?: object) => Promise<{ data: { blocks?: Array<{ paragraphs: Array<{ lines: Array<{ words: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }> }> }> }> | null } }>;
  terminate: () => Promise<unknown>;
};

let workerPromise: Promise<TesseractWorker> | null = null;

/** One reader per tab, made on first use. */
export function ocrWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const base = new URL(`${import.meta.env.BASE_URL}ocr/`, window.location.href).href;
      const w = await createWorker('eng', 1, {
        workerPath: `${base}worker.min.js`,
        corePath: base,
        langPath: base,
        gzip: true,
      });
      return w as unknown as TesseractWorker;
    })();
    workerPromise.catch(() => { workerPromise = null; });
  }
  return workerPromise;
}

/** The photo as a canvas, scaled so its long side is about `target` px:
 *  big phone photos are slow to read, small screenshots too blurred. */
export async function photoCanvas(src: Blob, target = 2000): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(src);
  const scale = target / Math.max(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const g = c.getContext('2d')!;
  g.filter = 'grayscale(1) contrast(1.4)';
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}

/** A small JPEG of a canvas region (the crop), or of the whole canvas (a thumbnail). */
export function canvasJpeg(c: HTMLCanvasElement, box?: { x: number; y: number; w: number; h: number }, maxSide = 900): string {
  const b = box ?? { x: 0, y: 0, w: c.width, h: c.height };
  const s = Math.min(1, maxSide / Math.max(b.w, b.h));
  const o = document.createElement('canvas');
  o.width = Math.max(1, Math.round(b.w * s));
  o.height = Math.max(1, Math.round(b.h * s));
  o.getContext('2d')!.drawImage(c, b.x, b.y, b.w, b.h, 0, 0, o.width, o.height);
  return o.toDataURL('image/jpeg', 0.85);
}

export interface CropResult { box: CropBox | null; why: string; crop: string; thumb: string; ms: number }

/** Read the printed labels on a report photo and cut out the box. */
export async function cropReportBox(src: Blob): Promise<CropResult> {
  const t0 = performance.now();
  const c = await photoCanvas(src);
  const w = await ocrWorker();
  const { data } = await w.recognize(c, {}, { blocks: true });
  const lines: OcrLine[] = [];
  for (const b of data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) {
    lines.push({ words: l.words.map((x) => ({ text: x.text, x0: x.bbox.x0, y0: x.bbox.y0, x1: x.bbox.x1, y1: x.bbox.y1 })) });
  }
  const { box, why } = findReportBox(lines, c.width, c.height);
  return {
    box, why,
    crop: box ? canvasJpeg(c, box) : '',
    thumb: canvasJpeg(c, undefined, 360),
    ms: Math.round(performance.now() - t0),
  };
}
