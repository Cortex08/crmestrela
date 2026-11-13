import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';

type SidebarState = 'expanded' | 'collapsed';
type SidebarContextValue = {
  state: SidebarState;
  open: boolean;
  setOpen: (v: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (v: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);
const STORAGE_KEY = 'sidebar_state';

export function useSidebar() {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar precisa estar dentro de SidebarProvider');
  return ctx;
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);
  const [open, setOpenState] = React.useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== 'collapsed';
    } catch {
      return true;
    }
  });

  const setOpen = React.useCallback((v: boolean) => {
    setOpenState(v);
    try {
      localStorage.setItem(STORAGE_KEY, v ? 'expanded' : 'collapsed');
    } catch {
      /* ignore */
    }
  }, []);

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) setOpenMobile((o) => !o);
    else setOpen(!open);
  }, [isMobile, open, setOpen]);

  const value = React.useMemo<SidebarContextValue>(
    () => ({ state: open ? 'expanded' : 'collapsed', open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar }),
    [open, setOpen, openMobile, isMobile, toggleSidebar],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function Sidebar({ className, children }: { className?: string; children: React.ReactNode }) {
  const { isMobile, openMobile, setOpenMobile, state } = useSidebar();

  if (isMobile) {
    return (
      <DialogPrimitive.Root open={openMobile} onOpenChange={setOpenMobile}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 h-full w-72 border-r border-white/60 bg-sidebar/80 text-sidebar-foreground shadow-xl backdrop-blur-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left duration-300"
          >
            <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
            <div className="flex h-full flex-col overflow-y-auto">{children}</div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

  return (
    <aside
      data-state={state}
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-white/60 bg-sidebar/60 text-sidebar-foreground backdrop-blur-2xl transition-[width] duration-200 md:flex',
        state === 'collapsed' ? 'w-14' : 'w-64',
        className,
      )}
    >
      <div className="flex h-full flex-col overflow-y-auto overflow-x-hidden">{children}</div>
    </aside>
  );
}

export function SidebarTrigger({ className }: { className?: string }) {
  const { toggleSidebar } = useSidebar();
  return (
    <Button variant="ghost" size="icon" className={cn('h-8 w-8', className)} onClick={toggleSidebar} aria-label="Abrir/fechar menu">
      <PanelLeft />
    </Button>
  );
}

export const SidebarContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex min-h-0 flex-1 flex-col gap-1 pb-4', className)} {...props} />
);

export const SidebarGroup = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('relative flex w-full min-w-0 flex-col px-2 py-1', className)} {...props} />
);

export const SidebarGroupLabel = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70', className)} {...props} />
);

export const SidebarGroupContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('w-full text-sm', className)} {...props} />
);

export const SidebarMenu = ({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
  <ul className={cn('flex w-full min-w-0 flex-col gap-1', className)} {...props} />
);

export const SidebarMenuItem = ({ className, ...props }: React.LiHTMLAttributes<HTMLLIElement>) => (
  <li className={cn('relative', className)} {...props} />
);

export const SidebarMenuButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>(
  ({ asChild, className, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(
          'flex h-8 w-full items-center gap-2 overflow-hidden rounded-md px-2 text-left text-sm outline-none ring-sidebar-ring transition-colors focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0 [&>span]:truncate',
          className,
        )}
        {...props}
      />
    );
  },
);
SidebarMenuButton.displayName = 'SidebarMenuButton';
