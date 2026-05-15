import { Btn } from './index';
import { exportTable } from '../../utils/export';

export default function ExportToolbar({
  filename = 'export',
  title,
  columns,
  rows,
  elementId,
  formats = ['csv', 'excel', 'pdf', 'print'],
  disabled,
}) {
  const run = (format) => {
    if (!rows?.length && !elementId) return;
    exportTable({ format, filename, columns, rows: rows || [], title: title || filename, elementId });
  };

  return (
    <div className="export-toolbar">
      {formats.includes('csv') && (
        <Btn variant="ghost" size="sm" disabled={disabled} onClick={() => run('csv')}>CSV</Btn>
      )}
      {formats.includes('excel') && (
        <Btn variant="ghost" size="sm" disabled={disabled} onClick={() => run('excel')}>Excel</Btn>
      )}
      {formats.includes('pdf') && (
        <Btn variant="ghost" size="sm" disabled={disabled} onClick={() => run('pdf')}>PDF</Btn>
      )}
      {formats.includes('print') && (
        <Btn variant="ghost" size="sm" disabled={disabled} onClick={() => run('print')}>Print</Btn>
      )}
    </div>
  );
}
