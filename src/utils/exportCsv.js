/**
 * Export tabular data to CSV download.
 */
export function exportToCsv(filename, columns, rows) {
  const header = columns.map((c) => escapeCsv(c.label)).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => escapeCsv(c.export ? c.export(row) : row[c.key])).join(',')
  );
  const csv = [header, ...lines].join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function printElement(elementId) {
  const el = document.getElementById(elementId);
  if (!el) {
    window.print();
    return;
  }
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`
    <!DOCTYPE html><html><head><title>Print</title>
    <style>
      body { font-family: system-ui, sans-serif; font-size: 12px; padding: 16px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
      th { background: #f4f4f4; }
      .mono { font-family: monospace; }
      h1 { font-size: 16px; margin: 0 0 12px; }
    </style></head><body>${el.innerHTML}</body></html>
  `);
  w.document.close();
  w.focus();
  w.print();
  w.close();
}
