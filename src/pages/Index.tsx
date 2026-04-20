import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAgentAuth } from '@/hooks/useAgentAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Lock, Loader2, ArrowRight, RefreshCw } from 'lucide-react';
import logo from '@/assets/logo.png';

export default function Index() {
  const navigate = useNavigate();
  const { user, role, loading, error: authError, login } = useAgentAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [roleTimeout, setRoleTimeout] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!loading && user && role) {
      if (role === 'manager') navigate('/choose');
      else if (role === 'lead_admin') navigate('/accountability');
      else navigate('/agent');
    }
  }, [user, role, loading, navigate]);

  useEffect(() => {
    if (user && (loading || !role)) {
      timeoutRef.current = setTimeout(() => setRoleTimeout(true), 8000);
    } else {
      setRoleTimeout(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [user, role, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = () => {
    setRoleTimeout(false);
    window.location.reload();
  };

  if (loading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user && (loading || !role)) {
    const blockingError = authError || (roleTimeout ? 'Backend is temporarily unavailable. Please retry.' : '');

    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-sm px-6">
          {blockingError ? (
            <>
              <p className="text-destructive font-medium">{blockingError}</p>
              <Button onClick={handleRetry} variant="outline" className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Retry
              </Button>
            </>
          ) : (
            <>
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-muted-foreground text-sm">Loading your account...</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-[420px] px-6 relative z-10">
        {/* Logo & Branding */}
        <div className="text-center mb-10">
          <img src={logo} alt="Let's Get Moving" className="h-20 mx-auto mb-4 drop-shadow-lg" />
          <p className="text-muted-foreground text-sm mt-2">Agent Break Management System</p>
        </div>

        {/* Login Card */}
        <form onSubmit={handleSubmit} className="relative">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 rounded-3xl blur-xl" />
          <div className="relative glass-card rounded-3xl p-8 space-y-6 border border-border/80 shadow-xl">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-foreground">Email Address</Label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  className="pl-11 h-12 rounded-xl bg-background/50 border-border/60 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold text-foreground">Password</Label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="pl-11 h-12 rounded-xl bg-background/50 border-border/60 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 text-center">
                <p className="text-destructive text-sm font-medium">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 gradient-primary text-primary-foreground font-bold text-base rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Sign In
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-6 opacity-70">
          Contact your manager for account credentials
        </p>
      </div>
    </div>
  );
}

