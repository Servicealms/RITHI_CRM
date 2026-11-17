// ===========================================================================
// COPY THE ON-DEVICE TEXT READER INTO THE APP (the report-date trial, 2026-11-17).
//
// The reader (tesseract.js) is SELF-HOSTED: its worker, its engine and its
// English data are copied from node_modules into public/ocr/ before every dev
// run and build, and served from the app's own address. Nothing is fetched
// from an outside site at run time, and no report image ever leaves the
// device to be read -- the user's rule: customer details do not leave our
// systems. public/ocr/ is generated, so it is git-ignored.
//
// The engine comes in a SIMD and a plain build; the browser picks one. Only the
// LSTM engine is copied (the one `createWorker('eng', 1)` uses).
// ===========================================================================
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';

const out = 'public/ocr';
mkdirSync(out, { recursive: true });
const files = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz'],
];
for (const [from, to] of files) {
  if (!existsSync(from)) { console.error(`copy-ocr: ${from} is missing -- run npm install.`); process.exit(1); }
  copyFileSync(from, `${out}/${to}`);
}
