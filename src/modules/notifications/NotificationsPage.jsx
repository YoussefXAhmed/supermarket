/**
 * /notifications — full notification inbox.
 *
 * - Search by subject (substring, case-insensitive)
 * - Read/Unread filter
 * - Category filter (matches backend `_category_for` mapping)
 * - Click row to mark read + navigate to its source
 *
 * Reads from NotificationCenterContext (shared poller), so the badge stays
 * in sync with the bell without an extra fetch.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Btn, EmptyState, PageHeader } from '../../components/ui';
import { TablePageLayout, LayoutSection } from '../../components/layout/page-layouts';
import { useNotificationCenter } from '../../context/NotificationCenterContext';
import { fmtDateTime } from '../../utils/format';

const CATEGORIES = [
  { id: 'all',        labelKey: 'notifications.cat.all',        defaultLabel: 'All categories' },
  { id: 'approvals',  labelKey: 'notifications.cat.approvals',  defaultLabel: 'Approvals' },
  { id: 'purchasing', labelKey: 'notifications.cat.purchasing', defaultLabel: 'Purchasing' },
  { id: 'inventory',  labelKey: 'notifications.cat.inventory',  defaultLabel: 'Inventory' },
  { id: 'finance',    labelKey: 'notifications.cat.finance',    defaultLabel: 'Finance' },
  { id: 'pos',        labelKey: 'notifications.cat.pos',        defaultLabel: 'POS' },
  { id: 'shifts',     labelKey: 'notifications.cat.shifts',     defaultLabel: 'Shifts' },
  { id: 'system',     labelKey: 'notifications.cat.system',     defaultLabel: 'System' },
];

const READ_FILTERS = [
  { id: 'all',    labelKey: 'notifications.filter.all',    defaultLabel: 'All' },
  { id: 'unread', labelKey: 'notifications.filter.unread', defaultLabel: 'Unread' },
  { id: 'read',   labelKey: 'notifications.filter.read',   defaultLabel: 'Read' },
];

export default function NotificationsPage() {
  const { t } = useTranslation();
  const { rows, unread, markAllRead, openTarget } = useNotificationCenter();
  const [search, setSearch] = useState('');
  const [readFilter, setReadFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (readFilter === 'unread' && r.read) return false;
      if (readFilter === 'read' && !r.read) return false;
      if (categoryFilter !== 'all' && (r.category || 'system') !== categoryFilter) return false;
      if (q && !(r.subject || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, readFilter, categoryFilter]);

  const totalCount = rows.length;

  return (
    <TablePageLayout>
      <PageHeader
        title={t('notifications.title', { defaultValue: 'Notifications' })}
        subtitle={t('notifications.subtitle', {
          defaultValue: '{{unread}} unread of {{total}}',
          unread,
          total: totalCount,
        })}
        dense
        actions={
          unread > 0 ? (
            <Btn variant="ghost" size="sm" onClick={markAllRead}>
              {t('notifications.markAllRead', { defaultValue: 'Mark all read' })}
            </Btn>
          ) : null
        }
      />

      <LayoutSection variant="flat" flushHead>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="search"
            className="input"
            placeholder={t('notifications.searchPlaceholder', { defaultValue: 'Search notifications…' })}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: '1 1 220px', minWidth: 200 }}
            aria-label={t('notifications.searchPlaceholder', { defaultValue: 'Search notifications' })}
          />
          <select
            className="input"
            value={readFilter}
            onChange={(e) => setReadFilter(e.target.value)}
            aria-label={t('notifications.readFilter', { defaultValue: 'Read filter' })}
            style={{ maxWidth: 160 }}
          >
            {READ_FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {t(f.labelKey, { defaultValue: f.defaultLabel })}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label={t('notifications.categoryFilter', { defaultValue: 'Category' })}
            style={{ maxWidth: 200 }}
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {t(c.labelKey, { defaultValue: c.defaultLabel })}
              </option>
            ))}
          </select>
        </div>
      </LayoutSection>

      {filtered.length === 0 ? (
        <EmptyState
          icon="🔔"
          title={t('notifications.empty', { defaultValue: 'No notifications yet' })}
          desc={
            search || readFilter !== 'all' || categoryFilter !== 'all'
              ? t('notifications.noMatches', { defaultValue: 'No notifications match these filters.' })
              : t('notifications.allClear', { defaultValue: "You're all caught up." })
          }
        />
      ) : (
        <LayoutSection variant="raised" flushHead>
          <ul className="notifications-page__list">
            {filtered.map((row) => (
              <li
                key={row.name}
                className={`notifications-page__item${row.read ? ' notifications-page__item--read' : ''}`}
                onClick={() => openTarget(row)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') openTarget(row); }}
              >
                <span className={`notif-bell__dot${row.read ? ' notif-bell__dot--muted' : ''}`} aria-hidden />
                <div className="notifications-page__body">
                  <p className="notifications-page__subject">{row.subject}</p>
                  <p className="notifications-page__meta">
                    <span className={`notifications-page__cat notifications-page__cat--${row.category || 'system'}`}>
                      {t(`notifications.cat.${row.category || 'system'}`, { defaultValue: row.category || 'system' })}
                    </span>
                    <span>·</span>
                    <span>{fmtDateTime(row.creation)}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </LayoutSection>
      )}
    </TablePageLayout>
  );
}
