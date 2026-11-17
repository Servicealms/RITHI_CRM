// ===========================================================================
// THE ON-DEVICE READER, AND THE CROP (report-date check, Phase A).
//
// Everything here runs in the browser. The reader is tesseract.js, served from
// the app's own /ocr/ folder (scripts/copy-ocr.mjs) and loaded only when it is
// first needed -- about 7 MB, once, then kept by the browser. A PDF's first
// page is drawn here by pdf.js (bundled with the app). The photo is read here,
// the box is cut out here, and nothing is sent anywhere: Phase A only SHOWS
// the box, so it can be checked before any reading service exists.
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

// THE LONG SIDE THE READER WORKS AT. 2,600 px: a whole A4 sheet photographed
// with the form small in the frame still gives printed labels the reader can
// see; much larger only makes each read slower on a phone.
const TARGET = 2600;

/** Draw a source onto a fresh canvas `w` x `h`, greyed and sharpened in contrast. */
function greyCanvas(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(w); c.height = Math.round(h);
  const g = c.getContext('2d')!;
  g.filter = 'grayscale(1) contrast(1.4)';
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** The photo as a canvas, scaled so its long side is about `target` px:
 *  big phone photos are slow to read, small screenshots too blurred. */
export async function photoCanvas(src: Blob, target = TARGET): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(src);
  const scale = target / Math.max(bmp.width, bmp.height);
  const c = greyCanvas(bmp, bmp.width * scale, bmp.height * scale);
  bmp.close?.();
  return c;
}

/** PAGE 1 OF A PDF as a canvas (most recent manual reports are PDFs: 15 of the
 *  latest 20 in the first trial run). Rendered here by pdf.js, whose worker is
 *  bundled with the app -- the file goes nowhere. */
export async function pdfCanvas(src: Blob, target = TARGET): Promise<HTMLCanvasElement> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await src.arrayBuffer()) }).promise;
  try {
    const page = await doc.getPage(1);
    const v1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: target / Math.max(v1.width, v1.height) });
    const raw = document.createElement('canvas');
    raw.width = Math.round(vp.width); raw.height = Math.round(vp.height);
    const g = raw.getContext('2d')!;
    g.fillStyle = '#fff'; g.fillRect(0, 0, raw.width, raw.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    return greyCanvas(raw, raw.width, raw.height);
  } finally {
    void doc.destroy();
  }
}

/** The canvas turned by 90, 180 or 270 degrees clockwise. */
export function rotated(c: HTMLCanvasElement, deg: 90 | 180 | 270): HTMLCanvasElement {
  const o = document.createElement('canvas');
  const side = deg === 180 ? false : true;
  o.width = side ? c.height : c.width;
  o.height = side ? c.width : c.height;
  const g = o.getContext('2d')!;
  g.translate(o.width / 2, o.height / 2);
  g.rotate((deg * Math.PI) / 180);
  g.drawImage(c, -c.width / 2, -c.height / 2);
  return o;
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

export interface CropResult { box: CropBox | null; why: string; crop: string; thumb: string; ms: number; turned: number; source: 'photo' | 'pdf' }

async function readLines(c: HTMLCanvasElement): Promise<OcrLine[]> {
  const w = await ocrWorker();
  const { data } = await w.recognize(c, {}, { blocks: true });
  const lines: OcrLine[] = [];
  for (const b of data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) {
    lines.push({ words: l.words.map((x) => ({ text: x.text, x0: x.bbox.x0, y0: x.bbox.y0, x1: x.bbox.x1, y1: x.bbox.y1 })) });
  }
  return lines;
}

/** Read the printed labels on a report (photo, or page 1 of a PDF) and cut out
 *  the box. A photo taken sideways or upside down is tried at 90, 270 and 180
 *  degrees before giving up -- each turn is one more read, so a report found
 *  upright costs one. */
export async function cropReportBox(src: Blob): Promise<CropResult> {
  const t0 = performance.now();
  const isPdf = /pdf/i.test(src.type);
  const upright = isPdf ? await pdfCanvas(src) : await photoCanvas(src);
  let firstWhy = '';
  for (const deg of [0, 90, 270, 180] as const) {
    const c = deg === 0 ? upright : rotated(upright, deg);
    const { box, why } = findReportBox(await readLines(c), c.width, c.height);
    if (box) {
      return { box, why: '', crop: canvasJpeg(c, box), thumb: canvasJpeg(c, undefined, 360),
               ms: Math.round(performance.now() - t0), turned: deg, source: isPdf ? 'pdf' : 'photo' };
    }
    if (!firstWhy) firstWhy = why;
  }
  return { box: null, why: `${firstWhy} (tried upright and turned 90, 270 and 180 degrees)`, crop: '',
           thumb: canvasJpeg(upright, undefined, 360), ms: Math.round(performance.now() - t0), turned: 0, source: isPdf ? 'pdf' : 'photo' };
}
