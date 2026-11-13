import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, Trash2, Check, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info' | 'success';
  loading?: boolean;
}

const variants = {
  danger: { icon: Trash2, iconClass: 'text-destructive', bg: 'bg-destructive/10', buttonClass: 'bg-destructive text-destructive-foreground hover:bg-destructive/90' },
  warning: { icon: AlertTriangle, iconClass: 'text-warning', bg: 'bg-warning/10', buttonClass: 'bg-warning text-warning-foreground hover:bg-warning/90' },
  info: { icon: Info, iconClass: 'text-primary', bg: 'bg-primary/10', buttonClass: 'bg-primary text-primary-foreground hover:bg-primary/90' },
  success: { icon: Check, iconClass: 'text-success', bg: 'bg-success/10', buttonClass: 'bg-success text-success-foreground hover:bg-success/90' },
};

export const ConfirmDialog = ({
  open, onOpenChange, onConfirm, title = 'Confirmar ação', description = 'Tem certeza que deseja continuar?',
  confirmText = 'Confirmar', cancelText = 'Cancelar', variant = 'danger', loading = false,
}: ConfirmDialogProps) => {
  const config = variants[variant];
  const Icon = config.icon;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className={cn('h-10 w-10 rounded-full flex items-center justify-center', config.bg)}>
              <Icon className={cn('h-5 w-5', config.iconClass)} />
            </div>
            <AlertDialogTitle>{title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="mt-2">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            className={cn(config.buttonClass)}
            disabled={loading}
          >
            {loading ? 'Aguarde...' : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
