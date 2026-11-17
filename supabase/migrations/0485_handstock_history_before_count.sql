-- ===========================================================================
-- 0485 -- THE HAND STOCK HISTORY BEFORE A COUNT, ON REQUEST (the user,
-- 2026-11-17: "After I upload or Reconcile a Stock, I should still be able to
-- See Old Historical Transactions" -- then: "Show entries before the count -
-- Add this.").
--
-- `handstock_movements` (0468) leaves out every movement ENTERED before the
-- latest count of its engineer + part, because the count already holds it --
-- which is what makes the figure start at the count, and also what took those
-- rows off Hand Stock's movement trail and Movements tab. They were never
-- deleted; they stay on their own registers.
--
-- `handstock_movements_history` is the SAME movements WITHOUT that filter,
-- with `before_count` saying which ones the count replaced. Hand Stock reads
-- it when "Show entries before the count" is on, and greys those rows. The
-- figure is untouched: every balance still reads `handstock_movements`.
--
-- Read out of a database built from every migration (0468's view after
-- 0483/0484): the arms verbatim, the labour filter kept, the count filter
-- turned into the `before_count` column. A NEW ARM of handstock_movements
-- must be added HERE TOO -- `_status.sql` row 392 compares the arm counts.
-- security_invoker, so each reader sees exactly the rows the movements
-- policies give them.
-- ===========================================================================

create or replace view public.handstock_movements_history as
 SELECT direction,
    movement,
    engineer_key,
    engineer,
    engineer_email,
    part_code,
    part,
    qty,
    moved_at,
    ref,
    ref_type,
    ref_uid,
    ucn,
    call_number,
    party_name,
    remarks,
    entered_at,
    -- 0485: entered before the latest count of this engineer + part, so
    -- inside that count and NOT in the figure. Shown on request only.
    (EXISTS ( SELECT 1
           FROM handstock_reconciliations k
          WHERE k.engineer_key = m.engineer_key AND k.part_code = m.part_code AND k.reconciled_at > COALESCE(m.entered_at, '-infinity'::timestamp with time zone))) AS before_count
   FROM ( SELECT 'IN'::text AS direction,
            'Stock out'::text AS movement,
            handstock_key(r.engineer) AS engineer_key,
            COALESCE(r.engineer, ''::text) AS engineer,
            COALESCE(r.engineer_email, ''::text) AS engineer_email,
            part_code(dl.part) AS part_code,
            COALESCE(dl.part, ''::text) AS part,
            COALESCE(dl.qty, 0::numeric) AS qty,
            COALESCE(d.dispatched_at, dl.created_at) AS moved_at,
            COALESCE(NULLIF(d.dc_number, ''::text), r.or_no, ''::text) AS ref,
            'Stores DC'::text AS ref_type,
            COALESCE(r.uid, ''::text) AS ref_uid,
            COALESCE(r.ucn, ''::text) AS ucn,
            COALESCE(r.call_number, ''::text) AS call_number,
            COALESCE(r.party_name, ''::text) AS party_name,
            COALESCE(NULLIF(l.dispatch_remarks, ''::text), ''::text) AS remarks,
            COALESCE(dl.sys_created_on, dl.created_at) AS entered_at
           FROM spare_dispatch_lines dl
             JOIN spare_dispatches d ON d.uid = dl.dispatch_uid
             JOIN spare_request_lines l ON l.id = dl.line_id
             JOIN spare_requests r ON r.uid = l.request_uid
          WHERE COALESCE(d.dispatched_at, dl.created_at) >= (( SELECT handstock_cutoff() AS handstock_cutoff))
        UNION ALL
         SELECT 'IN'::text AS direction,
            'Stock out'::text AS movement,
            handstock_key(r.engineer) AS engineer_key,
            COALESCE(r.engineer, ''::text) AS engineer,
            COALESCE(r.engineer_email, ''::text) AS engineer_email,
            part_code(l.part) AS part_code,
            COALESCE(l.part, ''::text) AS part,
                CASE
                    WHEN COALESCE(l.dispatched_qty, 0::numeric) > 0::numeric THEN l.dispatched_qty
                    ELSE COALESCE(l.qty, 0::numeric)
                END AS qty,
            COALESCE(l.dispatched_at, r.dispatched_at, l.created_at, r.created_at) AS moved_at,
            COALESCE(NULLIF(l.dc_number, ''::text), r.or_no, ''::text) AS ref,
            'Stores DC'::text AS ref_type,
            COALESCE(r.uid, ''::text) AS ref_uid,
            COALESCE(r.ucn, ''::text) AS ucn,
            COALESCE(r.call_number, ''::text) AS call_number,
            COALESCE(r.party_name, ''::text) AS party_name,
            COALESCE(NULLIF(l.dispatch_remarks, ''::text), ''::text) AS remarks,
            COALESCE(l.dispatched_at, r.dispatched_at, l.sys_created_on, l.created_at) AS entered_at
           FROM spare_request_lines l
             JOIN spare_requests r ON r.uid = l.request_uid
          WHERE COALESCE(l.dispatched_at, r.dispatched_at, l.created_at, r.created_at) >= (( SELECT handstock_cutoff() AS handstock_cutoff)) AND (COALESCE(l.dispatched_qty, 0::numeric) > 0::numeric OR COALESCE(l.stores_status, ''::text) ~* 'dispatch'::text) AND NOT (EXISTS ( SELECT 1
                   FROM spare_dispatch_lines dl
                  WHERE dl.line_id = l.id))
        UNION ALL
         SELECT 'OUT'::text AS direction,
            'Consumption'::text AS movement,
            handstock_key(c.engineer) AS engineer_key,
            COALESCE(c.engineer, ''::text) AS engineer,
            COALESCE(c.engineer_email, ''::text) AS engineer_email,
            part_code(c.part) AS part_code,
            COALESCE(c.part, ''::text) AS part,
            COALESCE(c.qty, 0::numeric) AS qty,
            c.created_at AS moved_at,
            COALESCE(NULLIF(btrim(c.call_number), ''::text), COALESCE(c.ucn, ''::text)) AS ref,
            'Call'::text AS ref_type,
            ''::text AS ref_uid,
            COALESCE(c.ucn, ''::text) AS ucn,
            COALESCE(c.call_number, ''::text) AS call_number,
            ''::text AS party_name,
            ''::text AS remarks,
            COALESCE(c.sys_created_on, c.created_at) AS entered_at
           FROM spare_consumption c
          WHERE c.created_at >= (( SELECT handstock_cutoff() AS handstock_cutoff))
        UNION ALL
         SELECT 'OUT'::text AS direction,
            'Transfer out'::text AS movement,
            handstock_key(t.from_engineer) AS engineer_key,
            COALESCE(t.from_engineer, ''::text) AS engineer,
            ''::text AS engineer_email,
            part_code(l.part) AS part_code,
            COALESCE(l.part, ''::text) AS part,
            COALESCE(l.qty, 0::numeric) AS qty,
            COALESCE(t.transfer_date::timestamp with time zone, t.created_at) AS moved_at,
            COALESCE(t.uid, ''::text) AS ref,
            'Transfer'::text AS ref_type,
            ''::text AS ref_uid,
            ''::text AS ucn,
            ''::text AS call_number,
            COALESCE(t.to_engineer, ''::text) AS party_name,
            COALESCE(t.remarks, ''::text) AS remarks,
            COALESCE(l.sys_created_on, t.sys_created_on, t.created_at) AS entered_at
           FROM stock_transfer_lines l
             JOIN stock_transfers t ON t.uid = l.transfer_uid
          WHERE COALESCE(t.transfer_date::timestamp with time zone, t.created_at) >= (( SELECT handstock_cutoff() AS handstock_cutoff))
        UNION ALL
         SELECT 'IN'::text AS direction,
            'Transfer in'::text AS movement,
            handstock_key(t.to_engineer) AS engineer_key,
            COALESCE(t.to_engineer, ''::text) AS engineer,
            ''::text AS engineer_email,
            part_code(l.part) AS part_code,
            COALESCE(l.part, ''::text) AS part,
            COALESCE(l.qty, 0::numeric) AS qty,
            COALESCE(t.transfer_date::timestamp with time zone, t.created_at) AS moved_at,
            COALESCE(t.uid, ''::text) AS ref,
            'Transfer'::text AS ref_type,
            ''::text AS ref_uid,
            ''::text AS ucn,
            ''::text AS call_number,
            COALESCE(t.from_engineer, ''::text) AS party_name,
            COALESCE(t.remarks, ''::text) AS remarks,
            COALESCE(l.sys_created_on, t.sys_created_on, t.created_at) AS entered_at
           FROM stock_transfer_lines l
             JOIN stock_transfers t ON t.uid = l.transfer_uid
          WHERE COALESCE(t.transfer_date::timestamp with time zone, t.created_at) >= (( SELECT handstock_cutoff() AS handstock_cutoff))
        UNION ALL
         SELECT 'OUT'::text AS direction,
            'Return'::text AS movement,
            handstock_key(m_1.engineer) AS engineer_key,
            COALESCE(m_1.engineer, ''::text) AS engineer,
            COALESCE(m_1.engineer_email, ''::text) AS engineer_email,
            part_code(m_1.part) AS part_code,
            COALESCE(m_1.part, ''::text) AS part,
            COALESCE(m_1.good_qty, 0::numeric) + COALESCE(m_1.defective_qty, 0::numeric) AS qty,
            COALESCE(m_1.mrn_date::timestamp with time zone, m_1.returned_at, m_1.created_at) AS moved_at,
            COALESCE(NULLIF(btrim(m_1.mrn_no), ''::text), m_1.uid, ''::text) AS ref,
            'MRN'::text AS ref_type,
            COALESCE(m_1.uid, ''::text) AS ref_uid,
            ''::text AS ucn,
            COALESCE(m_1.report_no, ''::text) AS call_number,
            COALESCE(m_1.customer_name, ''::text) AS party_name,
            btrim(
                CASE
                    WHEN COALESCE(m_1.defective_qty, 0::numeric) > 0::numeric THEN ((('good '::text || COALESCE(m_1.good_qty, 0::numeric)) || ', defective '::text) || m_1.defective_qty) || ' · '::text
                    ELSE ''::text
                END || COALESCE(m_1.remarks, ''::text)) AS remarks,
            COALESCE(m_1.sys_created_on, m_1.created_at) AS entered_at
           FROM material_returns m_1
          WHERE COALESCE(m_1.mrn_date::timestamp with time zone, m_1.returned_at, m_1.created_at) >= (( SELECT handstock_cutoff() AS handstock_cutoff))
        UNION ALL
         SELECT 'IN'::text AS direction,
            'Opening'::text AS movement,
            o.engineer_key,
            COALESCE(o.engineer, ''::text) AS engineer,
            ''::text AS engineer_email,
            o.part_code,
            COALESCE(o.part, ''::text) AS part,
            COALESCE(o.qty, 0::numeric) AS qty,
            o.as_of::timestamp with time zone AS moved_at,
            COALESCE(o.source, ''::text) AS ref,
            'Opening balance'::text AS ref_type,
            ''::text AS ref_uid,
            ''::text AS ucn,
            ''::text AS call_number,
            ''::text AS party_name,
            COALESCE(o.remarks, ''::text) AS remarks,
            COALESCE(o.sys_created_on, o.created_at) AS entered_at
           FROM handstock_opening o
          WHERE o.as_of::timestamp with time zone >= (( SELECT handstock_cutoff() AS handstock_cutoff))
        UNION ALL
         SELECT 'OUT'::text AS direction,
            'Consumption'::text AS movement,
            h.engineer_key,
            COALESCE(h.engineer, ''::text) AS engineer,
            ''::text AS engineer_email,
            h.part_code,
            COALESCE(h.part, ''::text) AS part,
            COALESCE(h.qty, 0::numeric) AS qty,
            COALESCE(h.consumed_at, h.created_at) AS moved_at,
            COALESCE(NULLIF(h.ref, ''::text), h.source, ''::text) AS ref,
            'Historical'::text AS ref_type,
            ''::text AS ref_uid,
            COALESCE(h.ucn, ''::text) AS ucn,
            COALESCE(h.call_number, ''::text) AS call_number,
            COALESCE(h.party_name, ''::text) AS party_name,
            COALESCE(h.remarks, ''::text) AS remarks,
            COALESCE(h.sys_created_on, h.created_at) AS entered_at
           FROM spare_consumption_history h
          WHERE COALESCE(h.consumed_at, h.created_at) >= (( SELECT handstock_cutoff() AS handstock_cutoff))
        UNION ALL
         SELECT 'IN'::text AS direction,
            'Stock out'::text AS movement,
            h.engineer_key,
            COALESCE(h.engineer, ''::text) AS engineer,
            ''::text AS engineer_email,
            h.part_code,
            COALESCE(h.part, ''::text) AS part,
            COALESCE(h.qty, 0::numeric) AS qty,
            COALESCE(h.issued_at, h.created_at) AS moved_at,
            COALESCE(NULLIF(h.so_no, ''::text), NULLIF(h.ref, ''::text), h.source, ''::text) AS ref,
            'Historical'::text AS ref_type,
            ''::text AS ref_uid,
            ''::text AS ucn,
            ''::text AS call_number,
            ''::text AS party_name,
            COALESCE(h.remarks, ''::text) AS remarks,
            COALESCE(h.sys_created_on, h.created_at) AS entered_at
           FROM spare_issue_history h
          WHERE COALESCE(h.issued_at, h.created_at) >= (( SELECT handstock_cutoff() AS handstock_cutoff)) AND NOT (EXISTS ( SELECT 1
                   FROM spare_request_lines l
                  WHERE lower(btrim(l.line_uid)) = lower(btrim(h.line_uid)) AND h.line_uid <> ''::text AND (COALESCE(l.dispatched_qty, 0::numeric) > 0::numeric OR COALESCE(l.stores_status, ''::text) ~* 'dispatch'::text)))
        UNION ALL
         SELECT
                CASE
                    WHEN a.qty > 0::numeric THEN 'IN'::text
                    ELSE 'OUT'::text
                END AS direction,
            'Adjustment'::text AS movement,
            a.engineer_key,
            COALESCE(a.engineer, ''::text) AS engineer,
            ''::text AS engineer_email,
            a.part_code,
            COALESCE(a.part, ''::text) AS part,
            abs(a.qty) AS qty,
            a.adjusted_at AS moved_at,
            COALESCE(NULLIF(btrim(a.reference), ''::text), 'ADJ-'::text || a.id::text) AS ref,
            'Adjustment'::text AS ref_type,
            a.id::text AS ref_uid,
            ''::text AS ucn,
            ''::text AS call_number,
            COALESCE(a.recorded_by_name, ''::text) AS party_name,
            COALESCE(a.reason, ''::text) AS remarks,
            COALESCE(a.sys_created_on, a.created_at) AS entered_at
           FROM handstock_adjustments a
          WHERE a.adjusted_at >= (( SELECT handstock_cutoff() AS handstock_cutoff))
        UNION ALL
         SELECT 'IN'::text AS direction,
            'Reconciliation'::text AS movement,
            k.engineer_key,
            COALESCE(k.engineer, ''::text) AS engineer,
            ''::text AS engineer_email,
            k.part_code,
            COALESCE(k.part, ''::text) AS part,
            k.physical_qty AS qty,
            k.reconciled_at AS moved_at,
            'REC-'::text || k.id::text AS ref,
            'Reconciliation'::text AS ref_type,
            k.id::text AS ref_uid,
            ''::text AS ucn,
            ''::text AS call_number,
            COALESCE(k.recorded_by_name, ''::text) AS party_name,
            btrim((((('Physical count '::text || k.physical_qty::text) || ' (system said '::text) || COALESCE(k.system_qty::text, '?'::text)) || ')'::text) ||
                CASE
                    WHEN btrim(COALESCE(k.remarks, ''::text)) <> ''::text THEN ' · '::text || btrim(k.remarks)
                    ELSE ''::text
                END) AS remarks,
            k.reconciled_at AS entered_at
           FROM handstock_reconciliations k
          WHERE k.reconciled_at >= (( SELECT handstock_cutoff() AS handstock_cutoff))) m
  WHERE NOT (part_code = ANY ((( SELECT labour_part_codes() AS labour_part_codes))::text[]));
alter view public.handstock_movements_history set (security_invoker = on);
revoke all on public.handstock_movements_history from anon;
grant select on public.handstock_movements_history to authenticated;
comment on view public.handstock_movements_history is
  'Hand stock movements INCLUDING those entered before the latest physical count of the line (before_count = true); the figure reads handstock_movements, which leaves them out (0485).';
