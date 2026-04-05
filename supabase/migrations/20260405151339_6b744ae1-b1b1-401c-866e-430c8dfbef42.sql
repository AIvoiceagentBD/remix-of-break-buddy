
-- Allow managers to insert active_breaks for any agent
CREATE POLICY "Managers can insert active breaks"
ON public.active_breaks FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

-- Allow managers to delete active_breaks for any agent
CREATE POLICY "Managers can delete active breaks"
ON public.active_breaks FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role));

-- Allow managers to insert break_sessions for any agent
CREATE POLICY "Managers can insert break sessions"
ON public.break_sessions FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

-- Allow managers to update break_sessions for any agent
CREATE POLICY "Managers can update break sessions"
ON public.break_sessions FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role));

-- Allow managers to delete break_sessions for any agent
CREATE POLICY "Managers can delete break sessions"
ON public.break_sessions FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role));
