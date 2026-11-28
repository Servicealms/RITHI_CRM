// The Drive button's mark and test, shared by the call screen and Call History
// (2026-11-28) so the two cannot drift.
/** Is this a Google Drive / Docs address? */
export const isDriveUrl = (u: string) => /^https:\/\/(drive|docs)\.google\.com\//i.test(String(u ?? '').trim());
/** A small Drive mark: three coloured edges of a triangle, drawn here (no
 *  external image), sized to the text beside it. */
export function DriveIcon() {
  return (
    <svg width="14" height="12" viewBox="0 0 87 78" aria-hidden="true" style={{ verticalAlign: '-1px' }}>
      <path d="M6 66l4 7c1 1 2 3 3 3h60l-11-19H0c0 2 1 3 2 4z" fill="#0066da" />
      <path d="M44 25L29 0c-1 1-3 2-4 4L2 44c-1 1-2 3-2 4h29z" fill="#00ac47" />
      <path d="M73 76c1 0 3-2 3-3l3-5 15-26c1-1 2-3 2-4H58l6 12z" fill="#ea4335" />
      <path d="M44 25L58 0c-1-1-3-1-4-1H34c-2 0-3 1-5 1z" fill="#00832d" />
      <path d="M58 48H29L14 74c1 1 3 2 5 2h48c1 0 3-1 5-2z" fill="#2684fc" />
      <path d="M73 27L59 4c-1-1-3-2-4-4L44 25l14 23h29c0-1 0-3-1-4z" fill="#ffba00" />
    </svg>
  );
}
