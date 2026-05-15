import { exportToCsv, printElement } from './exportCsv';

export { exportToCsv, printElement };

function cellValue(columns, row, col) {
  if (col.export) return col.export(row);
  const v = row[col.key];
  return v == null ? '' : String(v);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Microsoft Excel-compatible XML spreadsheet (no extra dependencies). */
export function exportToExcel(filename, columns, rows, sheetName = 'Sheet1') {
  const esc = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const header = columns.map((c) => `<Cell><Data ss:Type="String">${esc(c.label)}</Data></Cell>`).join('');
  const body = rows
    .map(
      (row) =>
        `<Row>${columns
          .map((c) => {
            const raw = cellValue(columns, row, c);
            const num = Number(raw);
            const isNum = raw !== '' && Number.isFinite(num) && !/[a-z]/i.test(raw);
            const type = isNum ? 'Number' : 'String';
            const val = isNum ? num : esc(raw);
            return `<Cell><Data ss:Type="${type}">${val}</Data></Cell>`;
          })
          .join('')}</Row>`
    )
    .join('');

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="${esc(sheetName)}">
  <Table>
   <Row>${header}</Row>
   ${body}
  </Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const name = filename.endsWith('.xls') ? filename : `${filename}.xls`;
  downloadBlob(name, blob);
}

/** Opens a print-ready document (user can Save as PDF). */
export function exportToPdf({ title = 'Report', html, elementId }) {
  const content = html || (elementId ? document.getElementById(elementId)?.innerHTML : '');
  if (!content) {
    window.print();
    return;
  }
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title>
<style>
  @page { margin: 12mm; }
  body { font-family: 'DM Sans', system-ui, sans-serif; font-size: 11px; color: #111; padding: 16px; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  .meta { color: #555; font-size: 10px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #f0f0f0; font-weight: 600; }
  .mono { font-family: monospace; }
</style></head><body>
<h1>${title}</h1>
<p class="meta">Generated ${new Date().toLocaleString()}</p>
${content}
</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

export function exportTable({ format, filename, columns, rows, title, elementId }) {
  switch (format) {
    case 'csv':
      exportToCsv(filename, columns, rows);
      break;
    case 'excel':
      exportToExcel(filename, columns, rows);
      break;
    case 'pdf':
      if (elementId) exportToPdf({ title, elementId });
      else {
        const tableHtml = buildHtmlTable(columns, rows);
        exportToPdf({ title, html: tableHtml });
      }
      break;
    case 'print':
      if (elementId) printElement(elementId);
      else {
        const tableHtml = buildHtmlTable(columns, rows);
        exportToPdf({ title: title || filename, html: tableHtml });
      }
      break;
    default:
      exportToCsv(filename, columns, rows);
  }
}

function buildHtmlTable(columns, rows) {
  const head = columns.map((c) => `<th>${c.label}</th>`).join('');
  const body = rows
    .map(
      (row) =>
        `<tr>${columns.map((c) => `<td>${cellValue(columns, row, c)}</td>`).join('')}</tr>`
    )
    .join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
