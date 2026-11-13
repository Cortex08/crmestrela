import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange?: (count: number) => void;
  itemsPerPageOptions?: number[];
  className?: string;
}

export function PaginationControls({
  currentPage, totalPages, totalItems, startIndex, endIndex, itemsPerPage,
  onPageChange, onItemsPerPageChange, itemsPerPageOptions = [10, 25, 50, 100], className,
}: PaginationControlsProps) {
  if (totalItems === 0) return null;

  return (
    <div className={cn('flex flex-col sm:flex-row items-center justify-between gap-4 py-4', className)}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Mostrando {startIndex} - {endIndex} de {totalItems}</span>
        {onItemsPerPageChange && (
          <div className="flex items-center gap-2 ml-4">
            <span>Por página:</span>
            <Select value={itemsPerPage.toString()} onValueChange={(v) => onItemsPerPageChange(Number(v))}>
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {itemsPerPageOptions.map((o) => (
                  <SelectItem key={o} value={o.toString()}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onPageChange(1)} disabled={currentPage === 1}>
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-1 px-2">
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 5 || currentPage <= 3) pageNum = i + 1;
            else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
            else pageNum = currentPage - 2 + i;
            return (
              <Button
                key={pageNum}
                variant={currentPage === pageNum ? 'default' : 'outline'}
                size="icon"
                className="h-8 w-8"
                onClick={() => onPageChange(pageNum)}
              >
                {pageNum}
              </Button>
            );
          })}
        </div>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages}>
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
