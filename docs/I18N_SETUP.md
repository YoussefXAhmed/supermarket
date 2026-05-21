# Frontend i18n setup

This project uses `i18next`, `react-i18next`, and `i18next-browser-languagedetector` for safe frontend-only localization.

## Scope

Current localization is intentionally limited to low-risk UI text:

- sidebar and module navigation labels
- navbar/session actions
- POS page buttons
- common actions such as save, submit, cancel, logout, refresh, checkout

Do **not** translate backend messages, ERPNext-generated document content, API responses, or dynamic validation messages in the frontend. Those messages are returned by ERPNext and should remain exact for debugging and support.

## Structure

```text
src/i18n/index.js
src/i18n/locales/en/translation.json
src/i18n/locales/ar/translation.json
src/components/common/LanguageSwitcher.jsx
```

`src/i18n/index.js` is imported once in `src/main.jsx`.

## Adding translations

1. Add the same key to both JSON files:

```json
{
  "common": {
    "save": "Save"
  }
}
```

```json
{
  "common": {
    "save": "حفظ"
  }
}
```

2. Use the key from React:

```jsx
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();
return <button>{t('common.save')}</button>;
```

Keep keys grouped by area (`common`, `nav`, `pos`, `shifts`) and avoid translating ERPNext data fields.

## Switching languages

`LanguageSwitcher` calls `i18n.changeLanguage()` and stores the selected language in local storage using the key:

```text
elmahdi-language
```

The language detector falls back to the browser language, then English.

## RTL notes

Arabic sets:

```html
<html lang="ar" dir="rtl">
```

English sets:

```html
<html lang="en" dir="ltr">
```

RTL is applied only through the document direction. Avoid broad layout rewrites. If alignment changes are needed later, prefer logical CSS (`start` / `end`) in small, local edits instead of globally replacing classes.

## Safety rules

- Do not change submit workflows.
- Do not change stock/accounting logic.
- Do not alter API contracts.
- Do not localize backend errors or validation messages.
- Add translations incrementally and test with `npm run build`.
