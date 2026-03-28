
CREATE TABLE public.login_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  date date NOT NULL,
  logged_in_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

ALTER TABLE public.login_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents can insert own login" ON public.login_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Agents can read own login" ON public.login_sessions
  FOR SELECT USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Agents can update own login" ON public.login_sessions
  FOR UPDATE USING (auth.uid() = user_id);
