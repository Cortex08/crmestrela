import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, somentePonto } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { FullScreenLoader } from '@/components/ui/loading';

interface ProtectedRouteProps {
  children: React.ReactNode;
  module?: string;
}

const fallbackRoutes = [
  { module: 'imoveis', path: '/imoveis' },
  { module: 'clientes', path: '/clientes' },
  { module: 'contratos', path: '/contratos' },
  { module: 'funil', path: '/funil' },
  { module: 'financeiro', path: '/financeiro' },
  { module: 'funcionarios', path: '/funcionarios' },
  { module: 'prospeccao', path: '/prospeccao' },
];

export const ProtectedRoute = ({ children, module }: ProtectedRouteProps) => {
  const { user, roles, loading: authLoading } = useAuth();
  const { hasAccess, loading: permLoading } = usePermissions();
  const location = useLocation();

  if (authLoading || permLoading) return <FullScreenLoader />;

  // Sem login: sempre vai para a tela de login (o original deixava entrar)
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  // Celular único de ponto: só a tela do quiosque
  if (somentePonto(roles) && location.pathname !== '/quiosque') return <Navigate to="/quiosque" replace />;

  if (module && !hasAccess(module)) {
    const fallback = fallbackRoutes.find((r) => hasAccess(r.module));
    return <Navigate to={fallback?.path ?? '/'} replace />;
  }

  return <>{children}</>;
};
