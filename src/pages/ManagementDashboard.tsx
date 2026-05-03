import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useAgentAuth } from '@/hooks/useAgentAuth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatDuration, exportToCSV } from '@/lib/store';
import { getTodayEST } from '@/lib/dateUtils';
import { BREAK_LABELS, BREAK_ICONS, DAILY_LIMIT_MINUTES, type BreakType } from '@/lib/types';
import {
  Download, Users, Clock, Activity, BarChart3, AlertTriangle, UserPlus, LogOut, Loader2,
  Pencil, Trash2, CheckCircle2, XCircle, ShieldAlert, Bell, CalendarIcon, Play, Square, Mail,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import logo from '@/assets/logo.png';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const BREAK_TYPES: BreakType[] = ['short', 'smoke', 'washroom', 'lunch', 'prayer'];

export default function ManagementDashboard() {
  const navigate = useNavigate();
  const { user, logout, loading: authLoading } = useAgentAuth();
  const [activeBreaks, setActiveBreaks] = useState<any[]>([]);
  const [todaySessions, setTodaySessions] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [approvalRequests, setApprovalRequests] = useState<any[]>([]);
  const [agentEmails, setAgentEmails] = useState<Record<string, string>>({});
  const [loggedInUserIds, setLoggedInUserIds] = useState<Set<string>>(new Set());
  const [agentUserIds, setAgentUserIds] = useState<Set<string>>(new Set());
  const [, setTick] = useState(0);

  // Add agent dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  // Edit agent dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editAgent, setEditAgent] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Delete confirm dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteAgent, setDeleteAgent] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Start break dialog
  const [startBreakDialogOpen, setStartBreakDialogOpen] = useState(false);
  const [startBreakAgent, setStartBreakAgent] = useState<any>(null);
  const [startBreakType, setStartBreakType] = useState<BreakType>('short');
  const [startBreakLoading, setStartBreakLoading] = useState(false);

  // Manual break dialog
  const [manualBreakDialogOpen, setManualBreakDialogOpen] = useState(false);
  const [manualBreakAgent, setManualBreakAgent] = useState<any>(null);
  const [manualBreakType, setManualBreakType] = useState<BreakType>('short');
  const [manualBreakMinutes, setManualBreakMinutes] = useState('5');
  const [manualBreakLoading, setManualBreakLoading] = useState(false);

  const today = getTodayEST();

  // Direct Supabase queries for dashboard refresh
  const refreshData = useCallback(async () => {
    try {
      const [activeResult, sessionsResult, profilesResult, approvalsResult, loginsResult, agentRolesResult] = await Promise.all([
        supabase.from('active_breaks').select('*'),
        supabase.from('break_sessions').select('*').eq('date', today),
        supabase.from('profiles').select('*'),
        supabase.from('break_approval_requests').select('*').eq('status', 'pending'),
        supabase.from('login_sessions').select('user_id').eq('date', today),
        supabase.from('user_roles').select('user_id').eq('role', 'agent'),
      ]);
      setActiveBreaks(activeResult.data || []);
      setTodaySessions(sessionsResult.data || []);
      setProfiles(profilesResult.data || []);
      setApprovalRequests(approvalsResult.data || []);
      setLoggedInUserIds(new Set((loginsResult.data || []).map((l: any) => l.user_id)));
      setAgentUserIds(new Set((agentRolesResult.data || []).map((r: any) => r.user_id)));
    } catch {
      // keep existing state
    }
  }, [today]);

  // Fetch agent emails via edge function (needs admin API)
  const fetchEmails = useCallback(async () => {
    try {
      const { data } = await supabase.functions.invoke<{ users: { user_id: string; email: string }[] }>('manage-agent', { body: { action: 'list' } });
      if (data?.users) {
        const map: Record<string, string> = {};
        for (const u of data.users) {
          map[u.user_id] = u.email;
        }
        setAgentEmails(map);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) { navigate('/'); return; }
    refreshData();
    fetchEmails();
    const interval = setInterval(() => { refreshData(); setTick(t => t + 1); }, 15000);
    return () => clearInterval(interval);
  }, [user, authLoading, navigate, refreshData, fetchEmails]);

  // Realtime for approval requests
  useEffect(() => {
    const channel = supabase
      .channel('mgmt-approvals')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'break_approval_requests' }, () => {
        refreshData();
        toast.info('New break approval request received!');
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refreshData]);

  // Create agent via edge function (needs admin API)
  const handleAddAgent = async () => {
    setAddError('');
    if (!newName.trim()) { setAddError('Name is required'); return; }
    if (!newEmail.trim()) { setAddError('Email is required'); return; }
    if (newPassword.length < 6) { setAddError('Password must be at least 6 characters'); return; }
    setAddLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ error?: string }>('create-agent', {
        body: { name: newName.trim(), email: newEmail.trim(), password: newPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setNewName(''); setNewEmail(''); setNewPassword('');
      setAddDialogOpen(false);
      toast.success('Agent created successfully');
      refreshData();
      fetchEmails();
    } catch (err: any) {
      setAddError(err.message);
    } finally {
      setAddLoading(false);
    }
  };

  // Edit agent - direct Supabase query
  const handleEditAgent = async () => {
    if (!editAgent || !editName.trim()) return;
    setEditLoading(true);
    try {
      const { error } = await supabase.from('profiles').update({ display_name: editName.trim() }).eq('user_id', editAgent.user_id);
      if (error) throw error;
      setEditDialogOpen(false);
      toast.success('Agent updated');
      refreshData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  // Delete agent via edge function (needs admin API to delete auth user)
  const handleDeleteAgent = async () => {
    if (!deleteAgent) return;
    setDeleteLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ error?: string }>('manage-agent', {
        body: { action: 'delete', user_id: deleteAgent.user_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDeleteDialogOpen(false);
      toast.success('Agent removed');
      refreshData();
      fetchEmails();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Approve/reject - direct Supabase queries
  const handleApproval = async (requestId: string, approved: boolean) => {
    try {
      const status = approved ? 'approved' : 'rejected';
      const { error } = await supabase.from('break_approval_requests')
        .update({ status, resolved_at: new Date().toISOString(), resolved_by: user!.id })
        .eq('id', requestId)
        .eq('status', 'pending');
      if (error) throw error;

      if (approved) {
        const { data: reqData } = await supabase.from('break_approval_requests')
          .select('user_id, agent_name, break_type').eq('id', requestId).single();
        if (reqData) {
          const { data: existing } = await supabase.from('active_breaks')
            .select('id').eq('user_id', reqData.user_id).maybeSingle();
          if (!existing) {
            await supabase.from('active_breaks').insert({
              user_id: reqData.user_id,
              agent_name: reqData.agent_name,
              break_type: reqData.break_type,
              start_time: new Date().toISOString(),
            });
          }
        }
      }
      toast.success(approved ? 'Break approved' : 'Break rejected');
      refreshData();
    } catch (err) {
      console.error('Approval error:', err);
      toast.error('Failed to process approval. Please try again.');
    }
  };

  // Manager start break - direct Supabase query
  const handleManagerStartBreak = async () => {
    if (!startBreakAgent) return;
    setStartBreakLoading(true);
    try {
      const { data: existing } = await supabase.from('active_breaks')
        .select('id').eq('user_id', startBreakAgent.user_id).maybeSingle();
      if (existing) throw new Error('Agent is already on break');

      const { error } = await supabase.from('active_breaks').insert({
        user_id: startBreakAgent.user_id,
        agent_name: startBreakAgent.display_name,
        break_type: startBreakType,
        start_time: new Date().toISOString(),
      });
      if (error) throw error;
      setStartBreakDialogOpen(false);
      toast.success(`Started ${BREAK_LABELS[startBreakType]} for ${startBreakAgent.display_name}`);
      refreshData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setStartBreakLoading(false);
    }
  };

  // Manager end break - via edge function (bypasses RLS for lead_admin)
  const handleManagerEndBreak = async (agentUserId: string, agentName: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-agent', {
        body: { action: 'end_break', user_id: agentUserId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Ended break for ${agentName}`);
      refreshData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Manual break - direct Supabase query
  const handleAddManualBreak = async () => {
    if (!manualBreakAgent) return;
    const mins = parseFloat(manualBreakMinutes);
    if (isNaN(mins) || mins <= 0) { toast.error('Enter a valid number of minutes'); return; }
    setManualBreakLoading(true);
    try {
      const durationSecs = Math.round(mins * 60);
      const now = new Date();
      const endTime = now.toISOString();
      const startTime = new Date(now.getTime() - durationSecs * 1000).toISOString();
      const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

      const { error } = await supabase.from('break_sessions').insert({
        user_id: manualBreakAgent.user_id,
        agent_name: manualBreakAgent.display_name,
        break_type: manualBreakType,
        start_time: startTime,
        end_time: endTime,
        duration: durationSecs,
        date: dateStr,
      });
      if (error) throw error;
      setManualBreakDialogOpen(false);
      toast.success(`Added ${mins} min ${BREAK_LABELS[manualBreakType]} for ${manualBreakAgent.display_name}`);
      refreshData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setManualBreakLoading(false);
    }
  };

  const handleLogout = async () => { await logout(); navigate('/'); };

  // Build agent summaries (only for users with 'agent' role)
  const agentProfiles = profiles.filter(p => agentUserIds.has(p.user_id));
  const agentSummaries = agentProfiles.map(p => {
    const agentSessions = todaySessions.filter(s => s.user_id === p.user_id);
    const active = activeBreaks.find(b => b.user_id === p.user_id);
    const sessTotal = agentSessions.reduce((sum, s) => sum + (s.duration || 0), 0);
    const activeElapsed = active ? Math.floor((Date.now() - new Date(active.start_time).getTime()) / 1000) : 0;
    const total = sessTotal + activeElapsed;
    const perType: Partial<Record<BreakType, number>> = {};
    agentSessions.forEach(s => {
      perType[s.break_type as BreakType] = (perType[s.break_type as BreakType] || 0) + (s.duration || 0);
    });
    return { ...p, total, isOnBreak: !!active, activeBreak: active, activeElapsed, sessions: agentSessions, perType, isOverLimit: total > DAILY_LIMIT_MINUTES * 60 };
  });

  // Agents who logged in today (based on login_sessions table)
  const activeAgentsToday = agentSummaries.filter(a => loggedInUserIds.has(a.user_id));
  const agentsOnBreak = agentSummaries.filter(a => a.isOnBreak);
  const agentsLoggedInNotOnBreak = activeAgentsToday.filter(a => !a.isOnBreak);

  const onBreakCount = activeBreaks.length;
  const overLimitCount = agentSummaries.filter(a => a.isOverLimit).length;

  const handleExportDaily = () => {
    exportToCSV(
      todaySessions,
      ['Agent Name', 'Break Type', 'Start', 'End', 'Duration (min)', 'Date'],
      ['agent_name', 'break_type', 'start_time', 'end_time', 'duration', 'date'],
      `break-log-${today}.csv`,
    );
  };

  const [exportDate, setExportDate] = useState<Date>();
  const [exportLoading, setExportLoading] = useState(false);
  const [exportPopoverOpen, setExportPopoverOpen] = useState(false);

  // Custom date summary
  const [summaryDate, setSummaryDate] = useState<Date | undefined>();
  const [summaryDateSessions, setSummaryDateSessions] = useState<any[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryPopoverOpen, setSummaryPopoverOpen] = useState(false);

  const handleLoadSummaryDate = async (date: Date) => {
    setSummaryDate(date);
    setSummaryPopoverOpen(false);
    setSummaryLoading(true);
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const { data: sessions } = await supabase
        .from('break_sessions')
        .select('*')
        .eq('date', dateStr);
      setSummaryDateSessions(sessions || []);
      if (!sessions || sessions.length === 0) {
        toast.info(`No break data found for ${format(date, 'PPP')}`);
      }
    } catch {
      toast.error('Failed to load data');
    } finally {
      setSummaryLoading(false);
    }
  };

  const clearSummaryDate = () => {
    setSummaryDate(undefined);
    setSummaryDateSessions([]);
  };

  const summarySessionsSource = summaryDate ? summaryDateSessions : todaySessions;
  const summaryLabel = summaryDate ? format(summaryDate, 'PPP') : 'Today';

  const customAgentSummaries = profiles.map(p => {
    const agentSessions = summarySessionsSource.filter(s => s.user_id === p.user_id);
    const activeForToday = !summaryDate ? activeBreaks.find(b => b.user_id === p.user_id) : null;
    const sessTotal = agentSessions.reduce((sum, s) => sum + (s.duration || 0), 0);
    const activeElapsed = activeForToday ? Math.floor((Date.now() - new Date(activeForToday.start_time).getTime()) / 1000) : 0;
    const total = sessTotal + activeElapsed;
    const perType: Partial<Record<BreakType, number>> = {};
    agentSessions.forEach(s => {
      perType[s.break_type as BreakType] = (perType[s.break_type as BreakType] || 0) + (s.duration || 0);
    });
    return { ...p, total, isOnBreak: !!activeForToday, activeBreak: activeForToday, sessions: agentSessions, perType, isOverLimit: total > DAILY_LIMIT_MINUTES * 60 };
  });

  const handleExportCustomDate = async (date: Date) => {
    setExportDate(date);
    setExportLoading(true);
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const { data: sessions } = await supabase
        .from('break_sessions')
        .select('*')
        .eq('date', dateStr);
      if (!sessions || sessions.length === 0) {
        toast.error(`No break data found for ${format(date, 'PPP')}`);
        return;
      }
      exportToCSV(
        sessions,
        ['Agent Name', 'Break Type', 'Start', 'End', 'Duration (s)', 'Date'],
        ['agent_name', 'break_type', 'start_time', 'end_time', 'duration', 'date'],
        `break-log-${dateStr}.csv`,
      );
      toast.success(`Exported ${sessions.length} records for ${format(date, 'PPP')}`);
      setExportPopoverOpen(false);
    } catch {
      toast.error('Failed to export data');
    } finally {
      setExportLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="border-b border-border/50 bg-card/60 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Let's Get Moving" className="h-10" />
            <div>
              <h1 className="text-lg font-bold text-foreground">Management</h1>
              <p className="text-xs text-muted-foreground">Real-time monitoring</p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {approvalRequests.length > 0 && (
              <div className="relative mr-1">
                <Bell className="w-5 h-5 text-warning" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-warning text-warning-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                  {approvalRequests.length}
                </span>
              </div>
            )}
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-xl">
                  <UserPlus className="w-3 h-3 mr-1" /> Add Agent
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Agent</DialogTitle>
                  <DialogDescription>Create a new agent account.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="agent-name">Name</Label>
                    <Input id="agent-name" placeholder="e.g. Sarah" value={newName} onChange={e => setNewName(e.target.value)} className="rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agent-email">Email</Label>
                    <Input id="agent-email" type="email" placeholder="sarah@company.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agent-password">Password</Label>
                    <Input id="agent-password" type="password" placeholder="Min 6 characters" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="rounded-xl" />
                  </div>
                  {addError && <p className="text-destructive text-sm">{addError}</p>}
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
                  <Button className="gradient-primary text-primary-foreground rounded-xl" onClick={handleAddAgent} disabled={addLoading}>
                    {addLoading && <Loader2 className="w-3 h-3 animate-spin mr-1" />} Add Agent
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button variant="outline" size="sm" onClick={handleExportDaily} className="rounded-xl">
              <Download className="w-3 h-3 mr-1" /> Today
            </Button>
            <Popover open={exportPopoverOpen} onOpenChange={setExportPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-xl">
                  <CalendarIcon className="w-3 h-3 mr-1" /> Export Date
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={exportDate}
                  onSelect={(d) => d && handleExportCustomDate(d)}
                  disabled={(date) => date > new Date()}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="sm" onClick={() => navigate('/accountability')} className="text-muted-foreground">
              <ShieldAlert className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">Accountability</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-6 relative z-10">
        {/* Approval Requests Banner */}
        {approvalRequests.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-warning" /> Break Approval Requests
            </h3>
            {approvalRequests.map(req => (
              <div key={req.id} className="flex items-center justify-between glass-card rounded-2xl p-4 border-warning/30 border-2">
                <div>
                  <p className="font-semibold text-foreground">{req.agent_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {BREAK_ICONS[req.break_type as BreakType]} {BREAK_LABELS[req.break_type as BreakType]} · Requested {new Date(req.requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleApproval(req.id, true)} className="gradient-primary text-primary-foreground rounded-xl">
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleApproval(req.id, false)} className="rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10">
                    <XCircle className="w-4 h-4 mr-1" /> Deny
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<Users className="w-4 h-4" />} label="Total Agents" value={agentSummaries.length} />
          <StatCard icon={<Activity className="w-4 h-4 text-primary" />} label="Active Today" value={activeAgentsToday.length} highlight />
          <StatCard icon={<BarChart3 className="w-4 h-4" />} label="On Break" value={onBreakCount} />
          <StatCard icon={<AlertTriangle className="w-4 h-4 text-destructive" />} label="Over Limit" value={overLimitCount} warn={overLimitCount > 0} />
        </div>

        <Tabs defaultValue="live" className="space-y-4">
          <TabsList className="bg-muted/50 rounded-2xl p-1">
            <TabsTrigger value="live" className="rounded-xl"><Activity className="w-3 h-3 mr-1" /> Live</TabsTrigger>
            <TabsTrigger value="summary" className="rounded-xl"><BarChart3 className="w-3 h-3 mr-1" /> Summary</TabsTrigger>
            <TabsTrigger value="agents" className="rounded-xl"><Users className="w-3 h-3 mr-1" /> Agents</TabsTrigger>
            <TabsTrigger value="manual-break" className="rounded-xl"><Plus className="w-3 h-3 mr-1" /> Manual Break</TabsTrigger>
            <TabsTrigger value="log" className="rounded-xl"><Clock className="w-3 h-3 mr-1" /> Log</TabsTrigger>
          </TabsList>

          {/* ===== LIVE TAB ===== */}
          <TabsContent value="live" className="space-y-6">
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Active on Break
                <span className="text-xs font-normal text-muted-foreground">({agentsOnBreak.length})</span>
              </h3>
              {agentsOnBreak.length === 0 ? (
                <div className="glass-card rounded-2xl p-8 text-center text-muted-foreground">
                  <p className="text-sm">No agents currently on break ✨</p>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {agentsOnBreak.map(a => {
                    const elapsed = a.activeBreak ? Math.floor((Date.now() - new Date(a.activeBreak.start_time).getTime()) / 1000) : 0;
                    return (
                      <div key={a.user_id} className="glass-card rounded-2xl p-5 hover:shadow-lg transition-shadow">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center text-primary-foreground font-bold shadow-sm">
                              {a.display_name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-foreground">{a.display_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {BREAK_ICONS[a.activeBreak.break_type as BreakType]} {BREAK_LABELS[a.activeBreak.break_type as BreakType]}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-extrabold timer-text text-primary">
                              {formatDuration(elapsed)}
                            </p>
                            <div className="w-2 h-2 rounded-full bg-primary status-pulse inline-block" />
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => handleManagerEndBreak(a.user_id, a.display_name)}
                        >
                          <Square className="w-3 h-3 mr-1" /> End Break
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                Active Agents
                <span className="text-xs font-normal text-muted-foreground">({agentsLoggedInNotOnBreak.length} logged in today)</span>
              </h3>
              {agentsLoggedInNotOnBreak.length === 0 ? (
                <div className="glass-card rounded-2xl p-8 text-center text-muted-foreground">
                  <p className="text-sm">No other agents active today</p>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {agentsLoggedInNotOnBreak.map(a => (
                    <div key={a.user_id} className="glass-card rounded-2xl p-5 hover:shadow-lg transition-shadow">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground font-bold">
                            {a.display_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">{a.display_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {a.total > 0 ? `${formatDuration(a.total)} break today` : 'Available'}
                            </p>
                          </div>
                        </div>
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                          <span className="w-2 h-2 rounded-full bg-primary" />
                          Online
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ===== MANUAL BREAK TAB ===== */}
          <TabsContent value="manual-break" className="space-y-4">
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Plus className="w-4 h-4 text-muted-foreground" />
                Add Manual Break
              </h3>
              <div className="glass-card rounded-2xl p-5">
                <p className="text-xs text-muted-foreground mb-3">Add missed break time for an agent</p>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {profiles.map(p => (
                    <Button
                      key={p.user_id}
                      variant="outline"
                      size="sm"
                      className="rounded-xl justify-start"
                      onClick={() => {
                        setManualBreakAgent(p);
                        setManualBreakType('short');
                        setManualBreakMinutes('5');
                        setManualBreakDialogOpen(true);
                      }}
                    >
                      <Plus className="w-3 h-3 mr-1" /> {p.display_name}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ===== SUMMARY TAB ===== */}
          <TabsContent value="summary">
            <div className="glass-card rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
                <h3 className="text-sm font-bold text-foreground">
                  Summary — {summaryLabel}
                </h3>
                <div className="flex items-center gap-2">
                  {summaryDate && (
                    <Button variant="ghost" size="sm" className="rounded-xl text-xs" onClick={clearSummaryDate}>
                      Back to Today
                    </Button>
                  )}
                  <Popover open={summaryPopoverOpen} onOpenChange={setSummaryPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="rounded-xl">
                        <CalendarIcon className="w-3 h-3 mr-1" /> Pick Date
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar
                        mode="single"
                        selected={summaryDate}
                        onSelect={(d) => d && handleLoadSummaryDate(d)}
                        disabled={(date) => date > new Date()}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              {summaryLoading ? (
                <div className="p-12 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                </div>
              ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left p-3 font-semibold text-muted-foreground">Agent</th>
                      <th className="text-left p-3 font-semibold text-muted-foreground">Status</th>
                      <th className="text-right p-3 font-semibold text-muted-foreground">Total</th>
                      {(Object.keys(BREAK_LABELS) as BreakType[]).map(type => (
                        <th key={type} className="text-right p-3 font-semibold text-muted-foreground hidden lg:table-cell">
                          {BREAK_ICONS[type]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {customAgentSummaries
                      .filter(a => a.total > 0 || a.isOnBreak)
                      .sort((a, b) => b.total - a.total)
                      .map(a => (
                        <tr key={a.user_id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                          <td className="p-3 font-medium text-foreground">{a.display_name}</td>
                          <td className="p-3">
                            {a.isOnBreak && a.activeBreak ? (
                              <span className="inline-flex items-center gap-1.5 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary status-pulse" />
                                {BREAK_LABELS[a.activeBreak.break_type as BreakType]}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">{summaryDate ? '-' : 'Available'}</span>
                            )}
                          </td>
                          <td className={`p-3 text-right font-mono font-bold ${a.isOverLimit ? 'text-destructive' : 'text-foreground'}`}>
                            {formatDuration(a.total)}
                            {a.isOverLimit && <AlertTriangle className="w-3 h-3 inline ml-1 text-destructive" />}
                          </td>
                          {(Object.keys(BREAK_LABELS) as BreakType[]).map(type => (
                            <td key={type} className="p-3 text-right font-mono text-muted-foreground hidden lg:table-cell">
                              {a.perType[type] ? formatDuration(a.perType[type]!) : '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    {customAgentSummaries.filter(a => a.total > 0 || a.isOnBreak).length === 0 && (
                      <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No break data for {summaryLabel}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          </TabsContent>

          {/* ===== AGENTS TAB ===== */}
          <TabsContent value="agents">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {profiles.map(p => {
                const isOnBreak = activeBreaks.some(b => b.user_id === p.user_id);
                const email = agentEmails[p.user_id];
                return (
                  <div key={p.id} className="glass-card rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center text-primary-foreground font-bold shadow-sm">
                          {p.display_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{p.display_name}</p>
                          {email && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Mail className="w-3 h-3" /> {email}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {isOnBreak ? (
                              <span className="text-primary font-medium">● On Break</span>
                            ) : 'Available'}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {isOnBreak ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => handleManagerEndBreak(p.user_id, p.display_name)}
                        >
                          <Square className="w-3 h-3 mr-1" /> End Break
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 rounded-xl"
                          onClick={() => {
                            setStartBreakAgent(p);
                            setStartBreakType('short');
                            setStartBreakDialogOpen(true);
                          }}
                        >
                          <Play className="w-3 h-3 mr-1" /> Start Break
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => {
                          setEditAgent(p);
                          setEditName(p.display_name);
                          setEditDialogOpen(true);
                        }}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => {
                          setDeleteAgent(p);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* ===== LOG TAB ===== */}
          <TabsContent value="log">
            <div className="glass-card rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left p-3 font-semibold text-muted-foreground">Agent</th>
                      <th className="text-left p-3 font-semibold text-muted-foreground">Type</th>
                      <th className="text-left p-3 font-semibold text-muted-foreground">Start</th>
                      <th className="text-left p-3 font-semibold text-muted-foreground">End</th>
                      <th className="text-right p-3 font-semibold text-muted-foreground">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...todaySessions].reverse().map(s => (
                      <tr key={s.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="p-3 font-medium text-foreground">{s.agent_name}</td>
                        <td className="p-3 text-muted-foreground">{BREAK_ICONS[s.break_type as BreakType]} {BREAK_LABELS[s.break_type as BreakType]}</td>
                        <td className="p-3 text-muted-foreground font-mono text-xs">{new Date(s.start_time).toLocaleTimeString()}</td>
                        <td className="p-3 text-muted-foreground font-mono text-xs">{s.end_time ? new Date(s.end_time).toLocaleTimeString() : '-'}</td>
                        <td className="p-3 text-right font-mono font-bold text-foreground">{formatDuration(s.duration || 0)}</td>
                      </tr>
                    ))}
                    {todaySessions.length === 0 && (
                      <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No breaks logged today</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Start Break Dialog */}
      <Dialog open={startBreakDialogOpen} onOpenChange={setStartBreakDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Break for {startBreakAgent?.display_name}</DialogTitle>
            <DialogDescription>Select break type to start.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Break Type</Label>
              <Select value={startBreakType} onValueChange={(v) => setStartBreakType(v as BreakType)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BREAK_TYPES.map(t => (
                    <SelectItem key={t} value={t}>
                      {BREAK_ICONS[t]} {BREAK_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStartBreakDialogOpen(false)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground rounded-xl" onClick={handleManagerStartBreak} disabled={startBreakLoading}>
              {startBreakLoading && <Loader2 className="w-3 h-3 animate-spin mr-1" />} Start Break
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Agent</DialogTitle>
            <DialogDescription>Update agent display name.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} className="rounded-xl" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground rounded-xl" onClick={handleEditAgent} disabled={editLoading}>
              {editLoading && <Loader2 className="w-3 h-3 animate-spin mr-1" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Agent</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently remove <strong>{deleteAgent?.display_name}</strong>? This will delete their account and all break history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteAgent} disabled={deleteLoading} className="rounded-xl">
              {deleteLoading && <Loader2 className="w-3 h-3 animate-spin mr-1" />} Remove Agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Break Dialog */}
      <Dialog open={manualBreakDialogOpen} onOpenChange={setManualBreakDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Manual Break for {manualBreakAgent?.display_name}</DialogTitle>
            <DialogDescription>Add missed break time that wasn't tracked.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Break Type</Label>
              <Select value={manualBreakType} onValueChange={(v) => setManualBreakType(v as BreakType)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BREAK_TYPES.map(t => (
                    <SelectItem key={t} value={t}>
                      {BREAK_ICONS[t]} {BREAK_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Duration (minutes)</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={manualBreakMinutes}
                onChange={e => setManualBreakMinutes(e.target.value)}
                className="rounded-xl"
                placeholder="e.g. 5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setManualBreakDialogOpen(false)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground rounded-xl" onClick={handleAddManualBreak} disabled={manualBreakLoading}>
              {manualBreakLoading && <Loader2 className="w-3 h-3 animate-spin mr-1" />} Add Break
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon, label, value, highlight, warn }: { icon: React.ReactNode; label: string; value: number; highlight?: boolean; warn?: boolean }) {
  return (
    <div className="glass-card rounded-2xl p-4 hover:shadow-lg transition-shadow">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-extrabold font-mono ${warn ? 'text-destructive' : highlight ? 'text-primary' : 'text-foreground'}`}>
        {value}
      </p>
    </div>
  );
}
