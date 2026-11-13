import { useState, useMemo, useCallback, useEffect } from 'react';

export function usePagination<T>({ data, itemsPerPage: initial = 10 }: { data: T[]; itemsPerPage?: number }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPageState] = useState(initial);

  const totalItems = data.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

  // Corrige a página quando a lista diminui (ex.: após filtrar)
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return data.slice(start, start + itemsPerPage);
  }, [data, currentPage, itemsPerPage]);

  const goToPage = useCallback((page: number) => setCurrentPage(Math.max(1, Math.min(page, totalPages))), [totalPages]);
  const setItemsPerPage = useCallback((count: number) => {
    setItemsPerPageState(count);
    setCurrentPage(1);
  }, []);

  return {
    currentPage,
    totalPages,
    paginatedData,
    goToPage,
    setItemsPerPage,
    itemsPerPage,
    startIndex: totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1,
    endIndex: Math.min(currentPage * itemsPerPage, totalItems),
    totalItems,
  };
}
