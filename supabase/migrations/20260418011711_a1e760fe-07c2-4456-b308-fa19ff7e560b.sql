CREATE TABLE public.accountability_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL,
  agent_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  call_id TEXT,
  proof_link TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  submitted_by UUID NOT NULL,
  submitted_by_name TEXT NOT NULL,
  approved_by UUID,
  manager_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.accountability_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own or all if staff"
ON public.accountability_cases FOR SELECT
TO authenticated
USING (
  auth.uid() = agent_id
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR public.has_role(auth.uid(), 'lead_admin'::public.app_role)
);

CREATE POLICY "Staff can insert cases"
ON public.accountability_cases FOR INSERT
TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'lead_admin'::public.app_role))
  AND submitted_by = auth.uid()
);

CREATE POLICY "Managers can update cases (not own submissions)"
ON public.accountability_cases FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  AND submitted_by <> auth.uid()
);

CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.accountability_cases(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by UUID NOT NULL,
  performed_by_name TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read audit logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  OR public.has_role(auth.uid(), 'lead_admin'::public.app_role)
);

CREATE POLICY "Authenticated can insert audit logs"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (performed_by = auth.uid());

CREATE INDEX idx_acc_cases_agent ON public.accountability_cases(agent_id);
CREATE INDEX idx_acc_cases_status ON public.accountability_cases(status);
CREATE INDEX idx_acc_cases_created ON public.accountability_cases(created_at DESC);
CREATE INDEX idx_audit_case ON public.audit_logs(case_id);

CREATE TRIGGER update_acc_cases_updated_at
BEFORE UPDATE ON public.accountability_cases
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();