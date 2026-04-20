import { Navigate } from 'react-router-dom';
import { useAgentAuth, type AppRole } from '@/hooks/useAgentAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: AppRole[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, role, loading } = useAgentAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/" replace />;
  if (role && !allowedRoles.includes(role)) {
    const fallback = role === 'manager' || role === 'lead_admin' ? '/choose' : '/agent';
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}
