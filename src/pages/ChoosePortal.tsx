import { useNavigate } from 'react-router-dom';
import { useAgentAuth } from '@/hooks/useAgentAuth';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, ShieldAlert, LogOut } from 'lucide-react';
import logo from '@/assets/logo.png';

export default function ChoosePortal() {
  const navigate = useNavigate();
  const { logout } = useAgentAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="w-full max-w-3xl px-6 relative z-10">
        <div className="text-center mb-10">
          <img src={logo} alt="Let's Get Moving" className="h-16 mx-auto mb-4 drop-shadow-lg" />
          <h1 className="text-2xl font-bold text-foreground">Choose a portal</h1>
          <p className="text-muted-foreground text-sm mt-1">Where would you like to go?</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          <button
            onClick={() => navigate('/management')}
            className="group glass-card rounded-3xl p-8 border border-border/80 shadow-xl text-left hover:scale-[1.02] hover:shadow-2xl transition-all"
          >
            <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center mb-4 group-hover:bg-primary/25 transition-colors">
              <LayoutDashboard className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-1">BreakTrack</h2>
            <p className="text-sm text-muted-foreground">Live break monitoring, agents, and reports.</p>
          </button>

          <button
            onClick={() => navigate('/accountability')}
            className="group glass-card rounded-3xl p-8 border border-border/80 shadow-xl text-left hover:scale-[1.02] hover:shadow-2xl transition-all"
          >
            <div className="w-14 h-14 rounded-2xl bg-destructive/15 flex items-center justify-center mb-4 group-hover:bg-destructive/25 transition-colors">
              <ShieldAlert className="w-7 h-7 text-destructive" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-1">Accountability Portal</h2>
            <p className="text-sm text-muted-foreground">Submit, approve, and audit deduction cases.</p>
          </button>
        </div>

        <div className="text-center mt-8">
          <Button variant="ghost" size="sm" onClick={async () => { await logout(); navigate('/'); }} className="gap-2">
            <LogOut className="w-4 h-4" /> Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
