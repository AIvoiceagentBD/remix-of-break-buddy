
-- Table for break approval requests when 3+ agents are already on break
CREATE TABLE public.break_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  agent_name text NOT NULL,
  break_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.break_approval_requests ENABLE ROW LEVEL SECURITY;

-- Agents can see their own requests
CREATE POLICY "Agents can read own requests"
ON public.break_approval_requests FOR SELECT
USING (auth.uid() = user_id OR has_role(auth.uid(), 'manager'::app_role));

-- Agents can insert their own requests
CREATE POLICY "Agents can insert own requests"
ON public.break_approval_requests FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Managers can update requests (approve/reject)
CREATE POLICY "Managers can update requests"
ON public.break_approval_requests FOR UPDATE
USING (has_role(auth.uid(), 'manager'::app_role));

-- Agents can delete own pending requests (cancel)
CREATE POLICY "Agents can delete own pending requests"
ON public.break_approval_requests FOR DELETE
USING (auth.uid() = user_id AND status = 'pending');

-- Enable realtime for approval requests so agents see instant updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.break_approval_requests;
