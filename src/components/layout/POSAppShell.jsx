/**
 * <POSAppShell> — full-bleed app shell for the POS terminal.
 *
 * Phase 3 — formalises POSPage's outer structure as a documented
 * layout primitive. The shell is intentionally LEAN: it provides the
 * page container, skip-to-content link, and workspace attribute. The
 * POS terminal owns its own header/body/bill layout inside.
 *
 *   <POSAppShell>
 *     <header className="pos-topbar">…</header>
 *     <div id="main" className="pos-body">
 *       <section>…</section>
 *       <aside className="pos-bill">…</aside>
 *     </div>
 *   </POSAppShell>
 *
 * Convention:
 *   • Caller is responsible for placing `id="main"` on the primary
 *     content region so the skip-link target lands correctly.
 *   • Caller is responsible for the topbar; the shell does not impose
 *     a particular header.
 *   • CSS lives in `pos.css` — the `.pos-page` class is owned there.
 *
 * Unlike AdminPageLayout etc., POSAppShell does NOT add max-width
 * constraints. POS occupies the full viewport (closes audit finding
 * 2.2 — documented exception to the "every page must use a layout
 * primitive" rule).
 */
import { useTranslation } from 'react-i18next';

export default function POSAppShell({ children, className = '' }) {
  const { t } = useTranslation();
  return (
    <>
      <a className="skip-link" href="#main">
        {t('ui.a11y.skipToMain', { defaultValue: 'Skip to main content' })}
      </a>
      <div className={`pos-page ${className}`.trim()} data-workspace="pos">
        {children}
      </div>
    </>
  );
}
