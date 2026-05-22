import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const run = (format) => {
    if (!rows?.length && !elementId) return;
    exportTable({ format, filename, columns, rows: rows || [], title: title || filename, elementId });
  };

  return (
    <div className="export-toolbar">
      {formats.includes('csv') && (
        <Btn variant="ghost" size="sm" disabled={disabled} onClick={() => run('csv')}>{t('ui.export.csv')}</Btn>
      )}
      {formats.includes('excel') && (
        <Btn variant="ghost" size="sm" disabled={disabled} onClick={() => run('excel')}>{t('ui.export.excel')}</Btn>
      )}
      {formats.includes('pdf') && (
        <Btn variant="ghost" size="sm" disabled={disabled} onClick={() => run('pdf')}>{t('ui.export.pdf')}</Btn>
      )}
      {formats.includes('print') && (
        <Btn variant="ghost" size="sm" disabled={disabled} onClick={() => run('print')}>{t('ui.export.print')}</Btn>
      )}
    </div>
  );
}
