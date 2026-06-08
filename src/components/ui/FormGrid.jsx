/**
 * <FormGrid> — responsive form-field grid.
 *
 * Pre-Phase-2 every form rolls its own:
 *   <div style={{ display: 'grid',
 *                 gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
 *                 gap: 12 }}>
 *
 * That single pattern accounts for 8+ inline-style violations from the
 * Phase 1 audit. This primitive replaces it with a tokenized API.
 *
 * Variants:
 *   cols="auto"           (default) responsive auto-fit, 280px min
 *   cols="auto-dense"     auto-fit, 240px min — denser settings forms
 *   cols={1|2|3|4}        explicit column count
 *   cols="responsive-2"   1 col below md, 2 cols above
 *
 * Density controls vertical gap:
 *   density="default"     --space-3 (12px)
 *   density="comfortable" --space-4 (16px)
 *   density="compact"     --space-2 (8px)
 *
 * Use inside a <form> when possible; <FormActions> goes after.
 */
export default function FormGrid({
  children,
  cols = 'auto',
  density = 'default',
  className = '',
  ...rest
}) {
  const colClass = typeof cols === 'number'
    ? `form-grid--cols-${cols}`
    : `form-grid--${cols}`;
  const densClass = density && density !== 'default' ? `form-grid--${density}` : '';
  return (
    <div className={`form-grid ${colClass} ${densClass} ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}
