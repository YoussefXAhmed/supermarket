import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher({ className = '' }) {
  const { i18n, t } = useTranslation();
  const current = i18n.resolvedLanguage?.startsWith('ar') ? 'ar' : 'en';

  const handleChange = (event) => {
    i18n.changeLanguage(event.target.value);
  };

  return (
    <label className={className || 'language-switcher'}>
      <select
        className="input input--sm"
        value={current}
        onChange={handleChange}
        aria-label={t('language.label')}
      >
        <option value="en">{t('language.english')}</option>
        <option value="ar">{t('language.arabic')}</option>
      </select>
    </label>
  );
}
