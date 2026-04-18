import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/lib/supabase';
import { useAgentAuth } from '@/hooks/useAgentAuth';
import AccountabilityLayout from '@/components/accountability/AccountabilityLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ACCOUNTABILITY_REASONS, caseFormSchema, type CaseFormValues,
} from '@/lib/accountability';

interface AgentOption { user_id: string; display_name: string; }

export default function AccountabilityNew() {
  const navigate = useNavigate();
  const { user, profile, role, loading: authLoading } = useAgentAuth();
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = role === 'manager' || role === 'lead_admin';

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<CaseFormValues>({
    resolver: zodResolver(caseFormSchema),
    defaultValues: { agent_id: '', reason: '', amount: 0, call_id: '', proof_link: '', notes: '' },
  });

  useEffect(() => {
    if (!authLoading && !canSubmit) {
      toast.error('You do not have permission to submit cases');
      navigate('/accountability', { replace: true });
    }
  }, [authLoading, canSubmit, navigate]);

  useEffect(() => {
    (async () => {
      // Load all agents (users with 'agent' role)
      const { data: roleRows } = await supabase
        .from('user_roles').select('user_id').eq('role', 'agent');
      const ids = (roleRows || []).map(r => r.user_id);
      if (!ids.length) { setAgents([]); setLoadingAgents(false); return; }
      const { data: profs } = await supabase
        .from('profiles').select('user_id, display_name').in('user_id', ids);
      const sorted = (profs || []).sort((a, b) => a.display_name.localeCompare(b.display_name));
      setAgents(sorted as AgentOption[]);
      setLoadingAgents(false);
    })();
  }, []);

  const onSubmit = async (values: CaseFormValues) => {
    if (!user) return;
    const agent = agents.find(a => a.user_id === values.agent_id);
    if (!agent) { toast.error('Invalid agent'); return; }

    setSubmitting(true);
    const submitterName = profile?.display_name || user.email || 'User';
    const { data: created, error } = await supabase
      .from('accountability_cases')
      .insert({
        agent_id: agent.user_id,
        agent_name: agent.display_name,
        reason: values.reason,
        amount: values.amount,
        call_id: values.call_id || null,
        proof_link: values.proof_link || null,
        notes: values.notes || null,
        submitted_by: user.id,
        submitted_by_name: submitterName,
      })
      .select('id')
      .single();

    if (error || !created) {
      toast.error(error?.message || 'Failed to submit case');
      setSubmitting(false);
      return;
    }

    await supabase.from('audit_logs').insert({
      case_id: created.id,
      action: 'created',
      performed_by: user.id,
      performed_by_name: submitterName,
      details: { reason: values.reason, amount: values.amount } as never,
    });

    toast.success('Case submitted');
    navigate(`/accountability/${created.id}`);
  };

  const reason = watch('reason');
  const agentId = watch('agent_id');

  return (
    <AccountabilityLayout title="New Accountability Case" subtitle="Submit a violation for review" backTo="/accountability">
      <Card className="max-w-2xl mx-auto">
        <CardHeader><CardTitle>Case details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label>Agent *</Label>
              <Select value={agentId} onValueChange={v => setValue('agent_id', v, { shouldValidate: true })} disabled={loadingAgents}>
                <SelectTrigger><SelectValue placeholder={loadingAgents ? 'Loading...' : 'Select agent'} /></SelectTrigger>
                <SelectContent>
                  {agents.map(a => <SelectItem key={a.user_id} value={a.user_id}>{a.display_name}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.agent_id && <p className="text-xs text-destructive mt-1">{errors.agent_id.message}</p>}
            </div>

            <div>
              <Label>Reason *</Label>
              <Select value={reason} onValueChange={v => setValue('reason', v, { shouldValidate: true })}>
                <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  {ACCOUNTABILITY_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.reason && <p className="text-xs text-destructive mt-1">{errors.reason.message}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Amount (USD) *</Label>
                <Input type="number" step="0.01" min="0" {...register('amount')} />
                {errors.amount && <p className="text-xs text-destructive mt-1">{errors.amount.message}</p>}
              </div>
              <div>
                <Label>Call / Lead ID</Label>
                <Input {...register('call_id')} placeholder="Optional" />
                {errors.call_id && <p className="text-xs text-destructive mt-1">{errors.call_id.message}</p>}
              </div>
            </div>

            <div>
              <Label>Proof Link</Label>
              <Input {...register('proof_link')} placeholder="https://..." />
              {errors.proof_link && <p className="text-xs text-destructive mt-1">{errors.proof_link.message}</p>}
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea {...register('notes')} rows={4} placeholder="Additional context..." />
              {errors.notes && <p className="text-xs text-destructive mt-1">{errors.notes.message}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate('/accountability')}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Submit Case
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </AccountabilityLayout>
  );
}
