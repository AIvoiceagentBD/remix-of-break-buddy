import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAgentAuth } from '@/hooks/useAgentAuth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/store';
import { getTodayEST } from '@/lib/dateUtils';
import {
  BreakType,
  BREAK_LABELS,
  BREAK_ICONS,
  DAILY_LIMIT_MINUTES,
} from '@/lib/types';
import { LogOut, Square, AlertTriangle, Clock, Loader2, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import logo from '@/assets/logo.png';

const BREAK_TYPES: BreakType[] = ['short', 'smoke', 'washroom', 'lunch', 'prayer'];
const MAX_CONCURRENT_BREAKS = 2;

export default function AgentPanel() {
  const { user, profile, logout, loading } = useAgentAuth();
  const navigate = useNavigate();
  const [selectedBreak, setSelectedBreak] = useState<BreakType>('short');
  const [activeBreak, setActiveBreak] = useState<{ break_type: string; start_time: string } | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [todayTotal, setTodayTotal] = useState(0);
  const [todaySessions, setTodaySessions] = useState<any[]>([]);
  const [activeBreakCount, setActiveBreakCount] = useState(0);
  const [pendingApproval, setPendingApproval] = useState<any>(null);
  const [startingBreak, setStartingBreak] = useState(false);

  const today = getTodayEST();
  const displayName = profile?.display_name || user?.email || 'Agent';

  // Direct Supabase queries for refresh
  const refreshData = useCallback(async () => {
    if (!user) return;
    try {
      const [activeResult, sessionsResult, allActiveResult, pendingResult] = await Promise.all([
        supabase.from('active_breaks').select('break_type, start_time').eq('user_id', user.id).maybeSingle(),
        supabase.from('break_sessions').select('*').eq('user_id', user.id).eq('date', today).order('start_time', { ascending: false }),
        supabase.from('active_breaks').select('id', { count: 'exact', head: true }),
        supabase.from('break_approval_requests').select('*').eq('user_id', user.id).eq('status', 'pending').maybeSingle(),
      ]);

      if (activeResult.data) {
        setActiveBreak(activeResult.data);
        setElapsedSeconds(Math.floor((Date.now() - new Date(activeResult.data.start_time).getTime()) / 1000));
      } else {
        setActiveBreak(null);
        setElapsedSeconds(0);
      }
      setActiveBreakCount(allActiveResult.count || 0);
      setPendingApproval(pendingResult.data || null);
      const sessions = sessionsResult.data || [];
      setTodayTotal(sessions.reduce((sum: number, s: any) => sum + (s.duration || 0), 0));
      setTodaySessions(sessions);
    } catch {
      // Silently keep existing state
    }
  }, [user, today]);

  // Record login for today
  useEffect(() => {
    if (!user) return;
    supabase.from('login_sessions')
      .upsert({ user_id: user.id, date: getTodayEST(), logged_in_at: new Date().toISOString() }, { onConflict: 'user_id,date' })
      .then(() => {});
  }, [user]);

  useEffect(() => {
    if (!loading && !user) { navigate('/'); return; }
    if (!user) return;
    refreshData();
    const interval = setInterval(() => {
      if (activeBreak) {
        setElapsedSeconds(Math.floor((Date.now() - new Date(activeBreak.start_time).getTime()) / 1000));
      }
    }, 1000);
    const dbInterval = setInterval(refreshData, 15000);
    return () => { clearInterval(interval); clearInterval(dbInterval); };
  }, [user, loading, navigate, refreshData, activeBreak]);

  // Listen for approval via realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('approval-updates')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'break_approval_requests',
        filter: `user_id=eq.${user.id}`,
      }, async (payload) => {
        const record = payload.new as any;
        if (record.status === 'approved') {
          toast.success('Break approved! Starting your break...');
          // Auto-start break directly
          const now = new Date().toISOString();
          await supabase.from('active_breaks').insert({
            user_id: user.id,
            agent_name: displayName,
            break_type: record.break_type,
            start_time: now,
          });
          setPendingApproval(null);
          refreshData();
        } else if (record.status === 'rejected') {
          toast.error('Break request was denied by management.');
          setPendingApproval(null);
          refreshData();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, displayName, refreshData]);

  if (loading || !user) return null;

  const handleStart = async () => {
    setStartingBreak(true);
    try {
      // Check concurrent breaks
      const { count } = await supabase.from('active_breaks').select('id', { count: 'exact', head: true });
      const activeCount = count || 0;

      if (activeCount >= MAX_CONCURRENT_BREAKS) {
        // Submit approval request
        await supabase.from('break_approval_requests').insert({
          user_id: user.id,
          agent_name: displayName,
          break_type: selectedBreak,
        });
        toast.info(`${activeCount} agents already on break. Approval request sent to management.`);
        refreshData();
        return;
      }

      // Check if already on break
      const { data: existing } = await supabase.from('active_breaks').select('id').eq('user_id', user.id).maybeSingle();
      if (existing) throw new Error('Already on break');

      const now = new Date().toISOString();
      const { error } = await supabase.from('active_breaks').insert({
        user_id: user.id,
        agent_name: displayName,
        break_type: selectedBreak,
        start_time: now,
      });
      if (error) throw error;

      setActiveBreak({ break_type: selectedBreak, start_time: now });
      setElapsedSeconds(0);
      toast.success('Break started!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to start break. Please try again.');
      console.error('Start break error:', err);
    } finally {
      setStartingBreak(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!pendingApproval) return;
    await supabase.from('break_approval_requests').delete().eq('id', pendingApproval.id).eq('user_id', user.id).eq('status', 'pending');
    setPendingApproval(null);
    toast.info('Break request cancelled.');
  };

  const handleEnd = async () => {
    if (!activeBreak) return;
    const { data: active } = await supabase.from('active_breaks').select('*').eq('user_id', user.id).maybeSingle();
    if (!active) return;

    const now = new Date();
    const start = new Date(active.start_time);
    const duration = Math.floor((now.getTime() - start.getTime()) / 1000);

    await supabase.from('break_sessions').insert({
      user_id: user.id,
      agent_name: displayName,
      break_type: active.break_type,
      start_time: active.start_time,
      end_time: now.toISOString(),
      duration,
      date: getTodayEST(),
    });
    await supabase.from('active_breaks').delete().eq('user_id', user.id);

    setActiveBreak(null);
    setElapsedSeconds(0);
    refreshData();
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const totalWithCurrent = todayTotal + (activeBreak ? elapsedSeconds : 0);
  const limitSeconds = DAILY_LIMIT_MINUTES * 60;
  const isOverLimit = totalWithCurrent > limitSeconds;
  const remaining = Math.max(0, limitSeconds - totalWithCurrent);
  const progressPercent = Math.min(100, (totalWithCurrent / limitSeconds) * 100);

  const circleRadius = 72;
  const circumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 p-4 md:p-8">
        <div className="max-w-lg mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Let's Get Moving" className="h-10" />
              <div>
                <h1 className="text-xl font-bold text-foreground">Hey, {displayName} 👋</h1>
                <p className="text-xs text-muted-foreground">
                  {activeBreakCount} agent{activeBreakCount !== 1 ? 's' : ''} on break right now
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/accountability')} className="text-muted-foreground hover:text-foreground">
              <ShieldAlert className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">Accountability</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-foreground">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>

          {/* Timer Card */}
          <div className={`relative rounded-3xl p-8 text-center transition-all duration-500 ${
            activeBreak 
              ? 'bg-gradient-to-br from-card via-card to-primary/5 border-2 border-primary/30 shadow-2xl shadow-primary/10' 
              : 'glass-card'
          }`}>
            {pendingApproval ? (
              <div className="py-6 space-y-4">
                <div className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center mx-auto">
                  <ShieldAlert className="w-8 h-8 text-warning" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Awaiting Approval</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {BREAK_ICONS[pendingApproval.break_type as BreakType]} {BREAK_LABELS[pendingApproval.break_type as BreakType]}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    2 agents are already on break. Management must approve.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-warning animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-warning animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-warning animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <Button variant="outline" onClick={handleCancelRequest} className="mt-2">
                  Cancel Request
                </Button>
              </div>
            ) : activeBreak ? (
              <>
                <p className="text-sm font-medium text-primary mb-1">
                  {BREAK_ICONS[activeBreak.break_type as BreakType]} {BREAK_LABELS[activeBreak.break_type as BreakType]}
                </p>

                <div className="relative w-48 h-48 mx-auto my-6">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
                    <circle cx="80" cy="80" r={circleRadius} fill="none" className="stroke-muted/40" strokeWidth="6" />
                    <circle
                      cx="80" cy="80" r={circleRadius} fill="none"
                      className={isOverLimit ? 'stroke-destructive' : 'stroke-primary'}
                      strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      style={{ transition: 'stroke-dashoffset 1s linear' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-extrabold timer-text text-foreground tracking-wider">
                      {formatDuration(elapsedSeconds)}
                    </span>
                    <span className="text-xs text-muted-foreground mt-1">elapsed</span>
                  </div>
                </div>

                <Button
                  onClick={handleEnd}
                  variant="destructive"
                  size="lg"
                  className="w-full h-12 rounded-xl font-bold text-base shadow-lg shadow-destructive/20 hover:scale-[1.02] active:scale-[0.98] transition-transform"
                >
                  <Square className="w-4 h-4 mr-2" /> End Break
                </Button>
              </>
            ) : (
              <>
                <div className="mb-6">
                  <p className="text-lg font-semibold text-foreground">Take a Break</p>
                  <p className="text-sm text-muted-foreground">Choose your break type below</p>
                </div>

                <div className="grid grid-cols-5 gap-3 mb-6">
                  {BREAK_TYPES.map(type => (
                    <button
                      key={type}
                      onClick={() => setSelectedBreak(type)}
                      className={`group flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all duration-200 text-xs font-semibold ${
                        selectedBreak === type
                          ? 'border-primary bg-primary/10 text-primary scale-105 shadow-md shadow-primary/15'
                          : 'border-border/50 bg-card hover:border-primary/30 hover:bg-accent/30 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <span className="text-2xl transition-transform group-hover:scale-110">{BREAK_ICONS[type]}</span>
                      <span className="truncate w-full text-center leading-tight">{BREAK_LABELS[type].replace(' Break', '')}</span>
                    </button>
                  ))}
                </div>

                <Button
                  onClick={handleStart}
                  size="lg"
                  disabled={startingBreak}
                  className="w-full h-12 gradient-primary text-primary-foreground font-bold text-base rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/35 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                >
                  {startingBreak ? <Loader2 className="w-5 h-5 animate-spin" /> : '▶ Start Break'}
                </Button>

                {activeBreakCount >= MAX_CONCURRENT_BREAKS && (
                  <p className="text-xs text-warning mt-3 flex items-center justify-center gap-1">
                    <ShieldAlert className="w-3 h-3" />
                    {activeBreakCount} agents on break — approval required
                  </p>
                )}
              </>
            )}
          </div>

          {/* Daily Summary */}
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16 shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 60 60">
                  <circle cx="30" cy="30" r="24" fill="none" className="stroke-muted/30" strokeWidth="4" />
                  <circle
                    cx="30" cy="30" r="24" fill="none"
                    className={isOverLimit ? 'stroke-destructive' : 'stroke-primary'}
                    strokeWidth="5" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 24}
                    strokeDashoffset={2 * Math.PI * 24 - (progressPercent / 100) * 2 * Math.PI * 24}
                    style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-extrabold text-foreground">{Math.round(progressPercent)}%</span>
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" /> Today's Usage
                  </span>
                  <span className={`text-sm font-mono font-bold ${isOverLimit ? 'text-destructive' : 'text-foreground'}`}>
                    {formatDuration(totalWithCurrent)}
                  </span>
                </div>
                {isOverLimit ? (
                  <div className="flex items-center gap-1.5 text-destructive text-xs mt-1.5 font-medium">
                    <AlertTriangle className="w-3 h-3" />
                    Exceeded by {formatDuration(totalWithCurrent - limitSeconds)}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {formatDuration(remaining)} remaining of {DAILY_LIMIT_MINUTES}m
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Today's Log */}
          {todaySessions.length > 0 && (
            <div className="glass-card rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" /> Today's Breaks
              </h3>
              <div className="space-y-2">
                {todaySessions.map((s: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2 px-3 rounded-xl bg-muted/30">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{BREAK_ICONS[s.break_type as BreakType] || '⏸'}</span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{BREAK_LABELS[s.break_type as BreakType] || s.break_type}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(s.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {s.end_time && ` — ${new Date(s.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-mono font-semibold text-foreground">{formatDuration(s.duration || 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
