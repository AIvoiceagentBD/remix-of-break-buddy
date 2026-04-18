import { ReactNode } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAgentAuth } from '@/hooks/useAgentAuth';
import { Button } from '@/components/ui/button';
import { ArrowLeft, LogOut, ShieldAlert, Plus } from 'lucide-react';

interface Props {
  children: ReactNode;
  title: string;
  subtitle?: string;
  backTo?: string;
  showNewButton?: boolean;
}

/**
 * Shared shell for the Accountability Portal pages.
 * Mirrors BreakTrack's existing styling (header card + container) for visual consistency.
 */
export default function AccountabilityLayout({ children, title, subtitle, backTo, showNewButton }: Props) {
  const navigate = useNavigate();
  const { profile, role, logout } = useAgentAuth();

  const homeFor = role === 'manager' ? '/management' : role === 'agent' ? '/agent' : '/accountability';
  const canSubmit = role === 'manager' || role === 'lead_admin';

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {backTo ? (
              <Button variant="ghost" size="icon" onClick={() => navigate(backTo)} aria-label="Back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            ) : (
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShieldAlert className="h-5 w-5 text-primary" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-semibold truncate">{title}</h1>
              {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showNewButton && canSubmit && (
              <Button size="sm" onClick={() => navigate('/accountability/new')}>
                <Plus className="h-4 w-4 mr-1" /> New Case
              </Button>
            )}
            <Link
              to={homeFor}
              className="hidden sm:inline-flex text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md hover:bg-muted"
            >
              {role === 'manager' ? 'BreakTrack' : role === 'agent' ? 'My Breaks' : 'Home'}
            </Link>
            <span className="hidden md:inline text-sm text-muted-foreground">{profile?.display_name}</span>
            <Button variant="ghost" size="icon" onClick={logout} aria-label="Logout">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
