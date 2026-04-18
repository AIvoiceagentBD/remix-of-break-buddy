import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAgentAuth } from '@/hooks/useAgentAuth';
import AccountabilityLayout from '@/components/accountability/AccountabilityLayout';
import { StatusBadge } from '@/components/accountability/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle2, XCircle, ExternalLink, History } from 'lucide-react';
import { toast } from 'sonner';
import {
  formatCurrency, type AccountabilityCase, type AuditLog,
} from '@/lib/accountability';

export default function AccountabilityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile, role, loading: authLoading } = useAgentAuth();
  const [caseData, setCaseData] = useState<AccountabilityCase | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [editAmount, setEditAmount] = useState('');
  const [managerNotes, setManagerNotes] = useState('');
  const [acting, setActing] = useState(false);

  const isManager = role === 'manager';
  const isStaff = isManager || role === 'lead_admin';

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data: c, error } = await supabase
      .from('accountability_cases').select('*').eq('id', id).maybeSingle();
    if (error || !c) {
      toast.error('Case not found or access denied');
      navigate('/accountability');
      return;
    }
    setCaseData(c as AccountabilityCase);
    setEditAmount(String(c.amount));
    setManagerNotes(c.manager_notes || '');

    // Load audit logs (visible only to staff per RLS; agents will get [])
    const { data: ll } = await supabase
      .from('audit_logs').select('*').eq('case_id', id).order('created_at', { ascending: false });
    setLogs((ll || []) as AuditLog[]);
    setLoading(false);
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  const isOwnSubmission = !!(user && caseData && caseData.submitted_by === user.id);
  const canAct = isManager && caseData?.status === 'pending' && !isOwnSubmission;

  const writeLog = async (action: string, details: Record<string, unknown>) => {
    if (!user || !caseData) return;
    await supabase.from('audit_logs').insert({
      case_id: caseData.id,
      action,
      performed_by: user.id,
      performed_by_name: profile?.display_name || user.email || 'User',
      details,
    });
  };

  const handleAction = async (status: 'approved' | 'rejected') => {
    if (!user || !caseData) return;
    const amt = Number(editAmount);
    if (!Number.isFinite(amt) || amt < 0) { toast.error('Invalid amount'); return; }

    setActing(true);
    const { error } = await supabase
      .from('accountability_cases')
      .update({
        status,
        amount: amt,
        manager_notes: managerNotes || null,
        approved_by: user.id,
      })
      .eq('id', caseData.id);

    if (error) {
      toast.error(error.message || `Failed to ${status === 'approved' ? 'approve' : 'reject'}`);
      setActing(false);
      return;
    }

    await writeLog(status, {
      previous_amount: caseData.amount,
      new_amount: amt,
      manager_notes: managerNotes || null,
    });

    toast.success(status === 'approved' ? 'Case approved' : 'Case rejected');
    setActing(false);
    load();
  };

  if (authLoading || loading || !caseData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <AccountabilityLayout title="Case Details" subtitle={caseData.agent_name} backTo="/accountability">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Case</CardTitle>
            <StatusBadge status={caseData.status} />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Field label="Agent" value={caseData.agent_name} />
              <Field label="Submitted" value={format(new Date(caseData.created_at), 'MMM d, yyyy HH:mm')} />
              <Field label="Submitted by" value={caseData.submitted_by_name} />
              <Field label="Amount" value={formatCurrency(Number(caseData.amount))} />
              <Field label="Reason" value={caseData.reason} />
              <Field label="Call / Lead ID" value={caseData.call_id || '—'} />
            </div>

            {caseData.proof_link && (
              <div>
                <Label className="text-xs text-muted-foreground">Proof</Label>
                <a
                  href={caseData.proof_link}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-1 text-primary hover:underline text-sm"
                >
                  {caseData.proof_link} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}

            {caseData.notes && (
              <div>
                <Label className="text-xs text-muted-foreground">Notes</Label>
                <p className="text-sm whitespace-pre-wrap">{caseData.notes}</p>
              </div>
            )}

            {caseData.manager_notes && (
              <div className="border-t pt-3">
                <Label className="text-xs text-muted-foreground">Manager notes</Label>
                <p className="text-sm whitespace-pre-wrap">{caseData.manager_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {isManager && caseData.status === 'pending' && (
            <Card>
              <CardHeader><CardTitle className="text-base">Manager actions</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {isOwnSubmission ? (
                  <p className="text-sm text-muted-foreground">
                    You submitted this case and cannot approve it yourself.
                  </p>
                ) : (
                  <>
                    <div>
                      <Label>Final amount</Label>
                      <Input
                        type="number" min="0" step="0.01"
                        value={editAmount}
                        onChange={e => setEditAmount(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Manager note (optional)</Label>
                      <Textarea
                        rows={3}
                        value={managerNotes}
                        onChange={e => setManagerNotes(e.target.value)}
                        placeholder="Reason for decision..."
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1" disabled={acting || !canAct}
                        onClick={() => handleAction('approved')}
                      >
                        {acting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                        Approve
                      </Button>
                      <Button
                        variant="destructive" className="flex-1" disabled={acting || !canAct}
                        onClick={() => handleAction('rejected')}
                      >
                        <XCircle className="h-4 w-4 mr-1" /> Reject
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {isStaff && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" /> Audit log</CardTitle></CardHeader>
              <CardContent>
                {logs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No actions logged yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {logs.map(l => (
                      <li key={l.id} className="text-sm border-l-2 border-muted pl-3">
                        <div className="font-medium capitalize">{l.action}</div>
                        <div className="text-xs text-muted-foreground">
                          {l.performed_by_name} · {format(new Date(l.created_at), 'MMM d, HH:mm')}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AccountabilityLayout>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium break-words">{value}</div>
    </div>
  );
}
