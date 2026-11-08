CREATE SEQUENCE public.claim_case_seq START 1;

CREATE TABLE public.claim_rows (
  case_id text PRIMARY KEY,
  case_status text NOT NULL DEFAULT 'open',
  claim_summary text NOT NULL DEFAULT '',
  policy_active_on_incident text NOT NULL DEFAULT '',
  claim_type text NOT NULL DEFAULT '',
  repair_type text NOT NULL DEFAULT '',
  quote_eur text NOT NULL DEFAULT '',
  incident_report_present text NOT NULL DEFAULT '',
  itemized_quote_present text NOT NULL DEFAULT '',
  injury_reported text NOT NULL DEFAULT '',
  liability_disputed text NOT NULL DEFAULT '',
  duplicate_flag text NOT NULL DEFAULT '',
  evidence_conflict text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.claim_rows TO anon, authenticated;
GRANT ALL ON public.claim_rows TO service_role;
ALTER TABLE public.claim_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "claim rows readable" ON public.claim_rows FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.fact_log (
  id bigserial PRIMARY KEY,
  case_id text NOT NULL REFERENCES public.claim_rows(case_id) ON DELETE CASCADE,
  field text NOT NULL,
  value text NOT NULL DEFAULT '',
  status text NOT NULL,
  source text NOT NULL,
  "timestamp" timestamptz NOT NULL DEFAULT now(),
  form_version text NOT NULL,
  policy_version text NOT NULL
);
CREATE INDEX fact_log_case_idx ON public.fact_log(case_id);
GRANT SELECT ON public.fact_log TO anon, authenticated;
GRANT ALL ON public.fact_log TO service_role;
GRANT USAGE ON SEQUENCE public.fact_log_id_seq TO service_role;
GRANT USAGE ON SEQUENCE public.claim_case_seq TO service_role;
ALTER TABLE public.fact_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fact log readable" ON public.fact_log FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.next_case_id() RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'FORM-' || lpad(nextval('public.claim_case_seq')::text, 4, '0');
$$;
REVOKE EXECUTE ON FUNCTION public.next_case_id() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_case_id() TO service_role;