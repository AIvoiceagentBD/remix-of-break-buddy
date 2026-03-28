-- Drop the restrictive SELECT policy
DROP POLICY "Agents can read own active break" ON public.active_breaks;

-- Allow all authenticated users to see all active breaks (needed for concurrent break count)
CREATE POLICY "Authenticated users can read all active breaks"
  ON public.active_breaks
  FOR SELECT
  USING (auth.uid() IS NOT NULL);