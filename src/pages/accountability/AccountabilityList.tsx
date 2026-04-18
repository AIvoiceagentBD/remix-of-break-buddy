import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAgentAuth } from '@/hooks/useAgentAuth';
import AccountabilityLayout from '@/components/accountability/AccountabilityLayout';
import { StatusBadge } from '@/components/accountability/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2, Search, FileDown, AlertTriangle, CheckCircle2, Clock, TrendingUp } from 'lucide-react';
import {
  ACCOUNTABILITY_REASONS, formatCurrency, type AccountabilityCase, type CaseStatus,
} from '@/lib/accountability';
import { toast } from 'sonner';

const PAGE_SIZE = 20;

export default function AccountabilityList() {
  const navigate = useNavigate();
  const { role, loading: authLoading } = useAgentAuth();
  const [cases, setCases] = useState<AccountabilityCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | CaseStatus>('all');
  const [reasonFilter, setReasonFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  const isStaff = role === 'manager' || role === 'lead_admin';

  const fetchCases = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('accountability_cases')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Failed to load cases');
    } else {
      setCases((data || []) as AccountabilityCase[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases.filter(c => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (reasonFilter !== 'all' && c.reason !== reasonFilter) return false;
      if (!q) return true;
      return (
        c.agent_name.toLowerCase().includes(q) ||
        c.reason.toLowerCase().includes(q) ||
        (c.call_id || '').toLowerCase().includes(q) ||
        c.submitted_by_name.toLowerCase().includes(q)
      );
    });
  }, [cases, search, statusFilter, reasonFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, statusFilter, reasonFilter]);

  // Stats (across visible scope = what user is allowed to see)
  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const pending = cases.filter(c => c.status === 'pending').length;
    const approvedThisMonth = cases.filter(c => c.status === 'approved' && new Date(c.created_at) >= monthStart);
    const totalAmount = approvedThisMonth.reduce((s, c) => s + Number(c.amount || 0), 0);
    const reasonCount = new Map<string, number>();
    cases.forEach(c => reasonCount.set(c.reason, (reasonCount.get(c.reason) || 0) + 1));
    const top = [...reasonCount.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      pending,
      approvedThisMonth: approvedThisMonth.length,
      totalAmount,
      topReason: top ? top[0] : '—',
    };
  }, [cases]);

  const exportCsv = () => {
    if (!filtered.length) { toast.info('No cases to export'); return; }
    const header = ['Date','Agent','Reason','Amount','Status','Submitted By','Approved By','Call ID','Notes','Manager Notes'];
    const rows = filtered.map(c => [
      format(new Date(c.created_at), 'yyyy-MM-dd HH:mm'),
      c.agent_name, c.reason, c.amount, c.status, c.submitted_by_name,
      c.approved_by || '', c.call_id || '', (c.notes || '').replace(/\n/g, ' '),
      (c.manager_notes || '').replace(/\n/g, ' '),
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accountability-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <AccountabilityLayout
      title="Accountability Portal"
      subtitle={isStaff ? 'Manage agent accountability cases' : 'Your accountability records'}
      showNewButton
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={<Clock className="h-4 w-4" />} label="Pending" value={stats.pending} />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Approved (month)" value={stats.approvedThisMonth} />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Total Amount (month)" value={formatCurrency(stats.totalAmount)} />
        <StatCard icon={<AlertTriangle className="h-4 w-4" />} label="Top Reason" value={stats.topReason} small />
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-base">Cases</CardTitle>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search agent, reason, call ID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 w-56"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={reasonFilter} onValueChange={setReasonFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All reasons</SelectItem>
                {ACCOUNTABILITY_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            {isStaff && (
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <FileDown className="h-4 w-4 mr-1" /> Export
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : pageItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShieldEmpty />
              <p className="mt-2">No cases found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Submitted By</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map(c => (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/accountability/${c.id}`)}>
                      <TableCell className="whitespace-nowrap text-sm">{format(new Date(c.created_at), 'MMM d, yyyy')}</TableCell>
                      <TableCell className="font-medium">{c.agent_name}</TableCell>
                      <TableCell className="max-w-[14rem] truncate">{c.reason}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(c.amount))}</TableCell>
                      <TableCell><StatusBadge status={c.status} /></TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{c.submitted_by_name}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/accountability/${c.id}`); }}>
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages} · {filtered.length} records
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </AccountabilityLayout>
  );
}

function StatCard({ icon, label, value, small }: { icon: React.ReactNode; label: string; value: React.ReactNode; small?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
          {icon}<span>{label}</span>
        </div>
        <div className={small ? 'text-sm font-medium truncate' : 'text-2xl font-semibold'}>{value}</div>
      </CardContent>
    </Card>
  );
}

function ShieldEmpty() {
  return (
    <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
      <AlertTriangle className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}
