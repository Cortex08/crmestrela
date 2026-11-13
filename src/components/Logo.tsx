import { cn } from '@/lib/utils';

/** Logo provisória. Para usar a logo oficial, salve como /public/logo.png e troque o src. */
export const Logo = ({ className }: { className?: string }) => (
  <img src="/logo.svg" alt="Estrela de Davi" className={cn('rounded-full bg-white object-contain', className)} />
);
