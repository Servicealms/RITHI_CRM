// ===========================================================================
// THE CONTRACT DETAILS EXPORT, IN THE OLD APPSHEET LAYOUT (the user,
// 2026-11-17: "I want a Contract Export in this Format"). One row per machine
// on a contract -- the `ContractDetails` sheet -- read from the
// `contract_details` view, which already resolves each common value as
// "the line's own, else the entry's".
//
// Three choices the user made (2026-11-17):
//   * Priority follows the sheet's own rule B2 =IF(LEN(F2)<1,"",2): 2 on every
//     line with an MC Number, blank otherwise (the column was removed from the
//     form in 0.9.243, so a stored value would be blank for new lines);
//   * Status is TODAY'S, by the register's 30-day rule (contractStatusText),
//     not the text keyed or imported;
//   * every line in the register the reader may see, not the screen's page.
// Product Details is Item Details Long (`ContractDetails C2 = O2`).
// Kept free of `supabase.ts` so a node script can test it.
// ===========================================================================
import { contractStatusText } from './coverspec';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? '' : v);

export const CONTRACT_DETAILS_FORMAT: [string, (r: Row) => unknown][] = [
  ['UID', (r) => s(r.uid)],
  ['Priority', (r) => (String(r.mc_number ?? '').trim() ? 2 : '')],
  ['Item Details Long', (r) => s(r.item_details_long)],
  ['Item Details', (r) => s(r.item_details)],
  ['MC Number', (r) => s(r.mc_number)],
  ['Contract Entry Date', (r) => s(r.contract_entry_date)],
  ['Party Name', (r) => s(r.party_name)],
  ['Payment Schedule', (r) => s(r.payment_schedule)],
  ['Bill Generate At', (r) => s(r.bill_generate_at)],
  ['Contract Type', (r) => s(r.contract_type)],
  ['Contract Start Date', (r) => s(r.contract_start)],
  ['Contract Period (Years)', (r) => s(r.contract_years)],
  ['Contract End Date', (r) => s(r.contract_end)],
  ['P M Visits (TOTAL)', (r) => s(r.pm_visits_total)],
  ['Product Details', (r) => s(r.item_details_long)],
  ['Product Code', (r) => s(r.product_code)],
  ['Product Name', (r) => s(r.product_name)],
  ['Product Serial Number', (r) => s(r.serial_number)],
  ['Rate', (r) => s(r.rate)],
  ['Item Tax Amount', (r) => s(r.item_tax_amount)],
  ['Total After Tax', (r) => s(r.total_after_tax)],
  ['Contract Period (Months)', (r) => s(r.contract_months)],
  ['Status', (r) => contractStatusText(r)],
  ['Present Item Status', (r) => s(r.present_item_status)],
  ['Last Contract Number', (r) => s(r.last_contract_number)],
  ['Last Contract End Date', (r) => s(r.last_contract_end)],
  ['SA Number', (r) => s(r.sa_number)],
  ['SA End Date', (r) => s(r.sa_end_date)],
  ['Added By', (r) => s(r.added_by)],
];

export const CONTRACT_DETAILS_HEADERS = CONTRACT_DETAILS_FORMAT.map(([h]) => h);

/** One export row per contract line, keyed by the headings above. */
export function contractDetailsRow(r: Row): Row {
  return Object.fromEntries(CONTRACT_DETAILS_FORMAT.map(([h, f]) => [h, f(r)]));
}
