/** Célula de CSV segura (evita fórmulas no Excel) */
export const csvCell = (v: any) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

/** Gera e baixa um CSV no formato que o Excel brasileiro abre direto (;) */
export const downloadCSV = (filename: string, header: string[], rows: any[][]) => {
  const content = '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
