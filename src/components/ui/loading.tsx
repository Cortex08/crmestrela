import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const LoadingCard = ({ text = 'Carregando...' }: { text?: string }) => (
  <div className="text-center py-12">
    <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
    <p className="text-muted-foreground text-sm mt-3 animate-pulse">{text}</p>
  </div>
);

export const FullScreenLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
  </div>
);

export const ListSkeleton = ({ count = 5 }: { count?: number }) => (
  <div className="space-y-3">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
    ))}
  </div>
);

export const CardSkeleton = ({ count = 3 }: { count?: number }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="h-48 bg-muted/50 rounded-xl animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
    ))}
  </div>
);

export const TableSkeleton = ({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) => (
  <div className="space-y-2">
    <div className="flex gap-4 p-3 bg-muted/30 rounded-lg">
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="h-4 bg-muted/50 rounded flex-1 animate-pulse" />
      ))}
    </div>
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="flex gap-4 p-3">
        {Array.from({ length: cols }).map((_, c) => (
          <div key={c} className={cn('h-4 bg-muted/30 rounded flex-1 animate-pulse')} />
        ))}
      </div>
    ))}
  </div>
);
