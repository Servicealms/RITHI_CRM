// ===========================================================================
// STEP 0 -- CAN GOOGLE READ THE SERVICE VISIT DATE OFF A MANUAL REPORT?
//
// The user, 2026-11-17: "Is it Possible to read the Date in the Uploaded
// Manual Report and Check with What is Updated here in Visit Date?" -- with
// two conditions: customer details must not leave our systems, and there is
// no AI service. So the only reader left is Google's own text recognition
// (OCR), run INSIDE this Google account on the files already in Drive.
//
// This is a TRIAL, not the feature. It answers one question before anything is
// built: on our real, handwritten reports, how often does Google read the
// Service Visit Date (and the Call No/UC No) correctly?
//
// WHAT IT DOES
//   1. Takes the latest TRIAL_COUNT visits in RITHI that have a manual report
//      (or the files you list in TRIAL_FILES).
//   2. For each, makes a temporary Google Doc from the file with OCR switched
//      on, reads its text, and deletes the temporary Doc at once.
//   3. Looks for the date beside "Service Visit Date" and for a UC No
//      (26K13F0017 shape), and compares both with what RITHI holds.
//   4. Writes one row per report to a NEW spreadsheet in your Drive, and puts
//      the counts in the log (View -> Logs / Execution log).
//
// NOTHING IS SENT ANYWHERE NEW. The report is read where it already is, by
// Google, under this account. Nothing is written to RITHI. The spreadsheet it
// makes is yours (it holds report text, so keep it to yourself and delete it
// after the trial).
//
// HOW TO RUN IT
//   a. Open the CallReg Apps Script project. File -> New -> Script, name it
//      ReportDateTrial, paste this whole file in. (It is NOT part of the Web
//      App: nothing here answers a web request, so no redeploy is needed.)
//   b. Left bar -> Services (+) -> "Drive API" -> Add. Either version works.
//   c. Choose the function `runReportDateTrial` at the top and press Run.
//      Approve the permissions it asks for (Drive, Docs, Sheets, external
//      requests -- the last is reading RITHI, as the DCCR mirror already does).
//   d. When it finishes, the log shows the counts and the spreadsheet's link.
//      Send back the COUNTS. If you want me to look at the misses, describe
//      them (e.g. "read 13/11/2026 as 13/11/2028") rather than pasting rows --
//      the rows carry customer names.
//
// It reads RITHI with the DCCR mirror's own sign-in (Script Properties
// SUPABASE_URL, SUPABASE_ANON_KEY and DCCR_EMAIL / DCCR_PASSWORD). If that
// login may not read visit reports, it says so -- then list the files in
// TRIAL_FILES below instead and run again.
// ===========================================================================

// How many recent visits with a manual report to try.
var TRIAL_COUNT = 20;

// OPTIONAL: try these instead of reading RITHI. One line per report:
//   { ucn: '26K13F0017', visitDate: '2026-11-17', url: 'https://drive.google.com/file/d/.../view' }
var TRIAL_FILES = [];

function runReportDateTrial() {
  var items = TRIAL_FILES.length ? TRIAL_FILES : _trialFromRithi();
  if (!items.length) {
    Logger.log('Nothing to try: RITHI returned no visits with a manual report. '
      + 'The DCCR login may not be allowed to read visit reports -- list files in TRIAL_FILES and run again.');
    return;
  }

  var ss = SpreadsheetApp.create('RITHI report date trial ' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd-MMM-yyyy HH:mm'));
  var sh = ss.getSheets()[0];
  sh.appendRow(['#', 'UCN in RITHI', 'Visit Date in RITHI', 'UC No read', 'UC No',
                'Service Visit Date read', 'Date', 'Every date found on the page', 'Note', 'File']);

  var n = { tried: 0, ocrFailed: 0, dateRead: 0, dateMatch: 0, dateMismatch: 0, dateUnsure: 0,
            ucnRead: 0, ucnMatch: 0, ucnMismatch: 0 };

  items.forEach(function (it, i) {
    n.tried++;
    var row = [i + 1, it.ucn, it.visitDate, '', '', '', '', '', '', it.url];
    var text = '';
    try {
      var id = _trialFileId(it.url);
      if (!id) throw new Error('no Drive file id in the link');
      text = _trialOcr(id);
    } catch (e) {
      n.ocrFailed++;
      row[8] = 'could not read the file: ' + String(e && e.message || e).slice(0, 150);
      sh.appendRow(row);
      return;
    }

    var found = _trialRead(text);

    // UC No
    if (found.ucn) {
      n.ucnRead++;
      row[3] = found.ucn;
      if (String(it.ucn || '').toUpperCase() === found.ucn) { n.ucnMatch++; row[4] = 'match'; }
      else { n.ucnMismatch++; row[4] = 'DIFFERENT'; }
    } else { row[4] = 'not read'; }

    // Service Visit Date
    row[7] = found.allDates.join('  ');
    if (found.visitDate) {
      n.dateRead++;
      row[5] = found.visitDate;
      if (found.visitDate === it.visitDate) { n.dateMatch++; row[6] = 'match'; }
      else { n.dateMismatch++; row[6] = 'DIFFERENT'; }
    } else {
      n.dateUnsure++;
      row[6] = found.allDates.length ? 'unsure which date' : 'no date read';
    }
    row[8] = found.note;
    sh.appendRow(row);
  });

  Logger.log('Report date trial -- ' + n.tried + ' reports tried.');
  Logger.log('  file could not be read:            ' + n.ocrFailed);
  Logger.log('  Service Visit Date read:           ' + n.dateRead
    + '  (same as RITHI ' + n.dateMatch + ', different ' + n.dateMismatch + ')');
  Logger.log('  date unsure / not read:            ' + n.dateUnsure);
  Logger.log('  UC No read:                        ' + n.ucnRead
    + '  (same as RITHI ' + n.ucnMatch + ', different ' + n.ucnMismatch + ')');
  Logger.log('Rows (with report text -- keep private): ' + ss.getUrl());
  Logger.log('A "different" is either a real mistake on the visit or a misread -- open a few and look: '
    + 'that is the number that decides whether this is worth building.');
}

// ---- the visits to try -----------------------------------------------------

function _trialFromRithi() {
  var auth = _dccrAuth();   // CallReg.gs: the DCCR mirror's sign-in
  var res = UrlFetchApp.fetch(
    auth.url + '/rest/v1/reports?select=ucn,visit_at,manual_report'
      + '&manual_report=not.is.null&manual_report=neq.'
      + '&order=updated_at.desc,id.desc&limit=' + TRIAL_COUNT,
    { method: 'get', headers: { apikey: auth.apikey, Authorization: 'Bearer ' + auth.bearer },
      muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    Logger.log('RITHI answered ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
    return [];
  }
  var rows = JSON.parse(res.getContentText()) || [];
  return rows.map(function (r) {
    return {
      ucn: String(r.ucn || '').toUpperCase(),
      visitDate: r.visit_at ? Utilities.formatDate(new Date(r.visit_at), 'Asia/Kolkata', 'yyyy-MM-dd') : '',
      url: String(r.manual_report || ''),
    };
  }).filter(function (r) { return r.url; });
}

function _trialFileId(url) {
  var m = String(url || '').match(/\/d\/([-\w]{20,})/) || String(url || '').match(/[?&]id=([-\w]{20,})/);
  return m ? m[1] : '';
}

// ---- OCR: a temporary Google Doc made from the file, read, then deleted -----

function _trialOcr(fileId) {
  var blob = DriveApp.getFileById(fileId).getBlob();
  var docId;
  if (Drive.Files.create) {           // Drive API v3
    docId = Drive.Files.create({ name: 'rithi-ocr-trial-tmp', mimeType: 'application/vnd.google-apps.document' },
      blob, { ocrLanguage: 'en', supportsAllDrives: true }).id;
  } else {                            // Drive API v2
    docId = Drive.Files.insert({ title: 'rithi-ocr-trial-tmp', mimeType: 'application/vnd.google-apps.document' },
      blob, { ocr: true, ocrLanguage: 'en', supportsAllDrives: true }).id;
  }
  try {
    return DocumentApp.openById(docId).getBody().getText();
  } finally {
    try { DriveApp.getFileById(docId).setTrashed(true); } catch (e) { /* best effort */ }
  }
}

// ---- reading the text -------------------------------------------------------

// A date as written on the form: 13/11/2026, 17.11.26, 13-11-26 -- day first.
var TRIAL_DATE = /(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{2,4})/g;

function _trialIso(d, m, y) {
  d = +d; m = +m; y = +y;
  if (y < 100) y += 2000;
  if (d < 1 || d > 31 || m < 1 || m > 12 || y < 2015 || y > 2100) return '';
  return y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
}

function _trialRead(text) {
  var t = String(text || '');
  var up = t.toUpperCase();
  var out = { ucn: '', visitDate: '', allDates: [], note: '' };

  // UC No: <YY><month letter A-L><DD><type letter><4 digits>, e.g. 26K13F0017.
  // Handwriting OCR often reads 0 as O and 1 as I -- forgiven in digit places.
  var ucnRe = /\b([0-9OIl]{2})\s?([A-L])\s?([0-9OIl]{2})\s?([A-Z])\s?([0-9OIl]{4})\b/g;
  var m;
  while ((m = ucnRe.exec(up)) !== null) {
    var fix = function (s) { return s.replace(/O/g, '0').replace(/[IL]/g, '1'); };
    out.ucn = fix(m[1]) + m[2] + fix(m[3]) + m[4] + fix(m[5]);
    break;
  }

  // Every date on the page, in reading order, with where it sits.
  var dates = [];
  TRIAL_DATE.lastIndex = 0;
  while ((m = TRIAL_DATE.exec(t)) !== null) {
    var iso = _trialIso(m[1], m[2], m[3]);
    if (iso) dates.push({ iso: iso, at: m.index });
  }
  out.allDates = dates.map(function (d) { return d.iso; });

  // The Service Visit Date: the first date AFTER that label, and before the
  // next label that carries a different date (Call Date sits right beside it
  // on this form, so a date nearer "CALL DATE" is not taken).
  var label = up.search(/SERVICE\s*VISIT\s*DATE|VISIT\s*DATE/);
  if (label < 0) { out.note = 'label "Service Visit Date" not found in the text'; return out; }
  var after = dates.filter(function (d) { return d.at > label && d.at - label < 200; });
  if (!after.length) { out.note = 'no date within reach of the label'; return out; }
  var callDateAt = up.search(/CALL\s*DATE/);
  var pick = after[0];
  if (callDateAt > label && pick.at > callDateAt && after.length === 1 && dates.length > 1) {
    out.note = 'the only date after the label also follows "Call Date" -- unsure';
    return out;
  }
  out.visitDate = pick.iso;
  return out;
}
