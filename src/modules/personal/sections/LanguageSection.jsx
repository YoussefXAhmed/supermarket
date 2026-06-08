import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Btn, PageLoading } from '../../../components/ui';
import { LayoutSection } from '../../../components/layout/page-layouts';
import { useNotify } from '../../../context/NotificationContext';
import { getLanguage, updateLanguage } from '../../../services/personalSettingsApi';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';

const LANGUAGES = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ar', label: 'العربية',  dir: 'rtl' },
];

export default function LanguageSection() {
  const { t, i18n } = useTranslation();
  const notify = useNotify();
  const [lang, setLang] = useState('en');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getLanguage();
      setLang(d.language || 'en');
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  const pick = async (code) => {
    setLang(code);
    // Apply immediately — i18n + dir attribute + localStorage. The
    // existing i18n init reads localStorage, so this also covers next
    // session boot.
    try {
      await i18n.changeLanguage(code);
      document.documentElement.lang = code;
      document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr';
      try { localStorage.setItem('i18nextLng', code); } catch { /* noop */ }
    } catch { /* keep going */ }
    try {
      await updateLanguage(code);
      notify.success(t('personal.language.saved', { defaultValue: 'Language updated.' }));
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    }
  };

  if (loading) return <LayoutSection variant="raised" title={t('personal.language.title', { defaultValue: 'Language' })}><PageLoading size={22} /></LayoutSection>;

  return (
    <LayoutSection variant="raised" title={t('personal.language.title', { defaultValue: 'Language' })}>
      <p className="personal-section__intro">
        {t('personal.language.desc', { defaultValue: 'Choose your interface language. Applies instantly to all pages and persists across devices.' })}
      </p>
      <div className="language-picker">
        {LANGUAGES.map((l) => (
          <Btn key={l.code}
            variant={lang === l.code ? 'primary' : 'ghost'}
            size="md"
            onClick={() => pick(l.code)}>
            <span className="language-picker__dir">{l.dir.toUpperCase()}</span>
            {l.label}
          </Btn>
        ))}
      </div>
    </LayoutSection>
  );
}
