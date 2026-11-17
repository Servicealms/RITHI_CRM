// ===========================================================================
// CHECK ONE VISIT'S DATE AGAINST ITS MANUAL REPORT (Visit Date Check, 0486).
//
// One visit, start to finish: open the report through the bridge every report
// viewer uses, find and cut out the Service Visit Date box ON THIS DEVICE
// (reportOcr.ts), and send ONLY the cut-out to the Edge Function
// read-report-box, which reads it (Haiku, then Sonnet if Haiku fails) and
// stores the reading. Shared by Reports -> Visit Date Check and the trial on
// Admin Config, so the two cannot drift apart.
//
// A report with no box is recorded as such (nothing sent), so it is not tried
// again; a report that could not be OPENED is not recorded, so it is.
// ===========================================================================
import { fetchAppDocument } from './sheets';
import { driveFileId } from './drive';
import { cropReportBox, type CropResult } from './reportOcr';
import { checkVisitDate, type VisitDateReading } from './supabase';

export interface VisitRunResult {
  status: 'read' | 'skipped' | 'no box' | 'not opened' | 'failed';
  note: string;
  crop?: CropResult;
  reading?: Partial<VisitDateReading>;
}

export async function checkOneVisit(v: { uid: string; manual_report: string }): Promise<VisitRunResult> {
  const id = driveFileId(v.manual_report);
  if (!id) return { status: 'not opened', note: 'no Drive file id in the link' };
  const got = await fetchAppDocument(id);
  if (!got.ok || !got.doc) return { status: 'not opened', note: got.error ?? 'could not open the file' };
  const mime = got.doc.mimeType || '';
  if (!/^image\//i.test(mime) && !/pdf/i.test(mime)) return { status: 'not opened', note: `not a photo or PDF (${mime || 'unknown type'})` };
  let crop: CropResult;
  try {
    const bytes = Uint8Array.from(atob(got.doc.dataBase64), (ch) => ch.charCodeAt(0));
    crop = await cropReportBox(new Blob([bytes], { type: mime }));
  } catch (e) {
    return { status: 'not opened', note: `could not read the file: ${e instanceof Error ? e.message : String(e)}` };
  }
  try {
    if (!crop.box || !crop.crop) {
      const r = await checkVisitDate(v.uid, '', crop.why || 'no box found');
      return { status: r.skipped ? 'skipped' : 'no box', note: crop.why, crop, reading: r.reading };
    }
    const r = await checkVisitDate(v.uid, crop.crop);
    return { status: r.skipped ? 'skipped' : 'read', note: '', crop, reading: r.reading };
  } catch (e) {
    return { status: 'failed', note: e instanceof Error ? e.message : String(e), crop };
  }
}

/** The model that answered, in words: "Haiku", or "Sonnet (Haiku failed)". */
export function modelWords(r: Partial<VisitDateReading>): string {
  const m = r.model ?? '';
  const name = /haiku/i.test(m) ? 'Haiku' : /sonnet/i.test(m) ? 'Sonnet' : m;
  return (r.tried?.length ?? 0) > 1 ? `${name} (Haiku failed${r.first_error ? `: ${r.first_error}` : ''})` : name;
}

export const OUTCOME_WORDS: Record<VisitDateReading['outcome'], string> = {
  match: 'Matches',
  mismatch: 'Differs',
  unreadable: 'Unreadable',
  no_box: 'No box found',
};
