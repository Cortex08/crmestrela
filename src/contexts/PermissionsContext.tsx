import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Permission {
  module: string;
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
}

interface PermissionsContextType {
  permissions: Permission[];
  loading: boolean;
  canCreate: (module: string) => boolean;
  canRead: (module: string) => boolean;
  canUpdate: (module: string) => boolean;
  canDelete: (module: string) => boolean;
  hasAccess: (module: string) => boolean;
  refetch: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

/**
 * Controla o que aparece na tela. A proteção real dos dados fica no banco (RLS):
 * mesmo que alguém burle a tela, o banco recusa o que o cargo não permite.
 */
export const PermissionsProvider = ({ children }: { children: ReactNode }) => {
  const { user, roles, loading: authLoading } = useAuth();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const isAdmin = roles.includes('admin');

  const fetchPermissions = useCallback(async () => {
    if (!user || roles.length === 0) {
      setPermissions([]);
      setLoading(false);
      return;
    }
    if (roles.includes('admin')) {
      setPermissions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('role_permissions')
      .select('module, can_create, can_read, can_update, can_delete')
      .in('role', roles);

    const merged = new Map<string, Permission>();
    if (!error) {
      (data || []).forEach((p: Permission) => {
        const e = merged.get(p.module);
        merged.set(
          p.module,
          e
            ? {
                module: p.module,
                can_create: e.can_create || p.can_create,
                can_read: e.can_read || p.can_read,
                can_update: e.can_update || p.can_update,
                can_delete: e.can_delete || p.can_delete,
              }
            : p,
        );
      });
    }
    setPermissions(Array.from(merged.values()));
    setLoading(false);
  }, [user, roles]);

  useEffect(() => {
    if (!authLoading) fetchPermissions();
  }, [authLoading, fetchPermissions]);

  const get = (m: string) => permissions.find((p) => p.module === m);
  const canCreate = (m: string) => !!user && (isAdmin || !!get(m)?.can_create);
  const canRead = (m: string) => !!user && (isAdmin || !!get(m)?.can_read);
  const canUpdate = (m: string) => !!user && (isAdmin || !!get(m)?.can_update);
  const canDelete = (m: string) => !!user && (isAdmin || !!get(m)?.can_delete);
  const hasAccess = (m: string) => {
    if (!user) return false;
    if (isAdmin) return true;
    if (m === 'usuarios') return false;
    if (m === 'dashboard' || m === 'perfil' || m === 'suporte') return true;
    return canRead(m);
  };

  return (
    <PermissionsContext.Provider
      value={{ permissions, loading: loading || authLoading, canCreate, canRead, canUpdate, canDelete, hasAccess, refetch: fetchPermissions }}
    >
      {children}
    </PermissionsContext.Provider>
  );
};

export const usePermissions = () => {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions must be used within a PermissionsProvider');
  return ctx;
};
