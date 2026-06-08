/**
 * <FormActions> — standardised save / cancel / danger button row.
 *
 * Per the Phase 2 design system, the canonical placement is:
 *   right-aligned (LTR), reversed in RTL via flexbox auto-mirroring
 *   gap = --space-2 (8px)
 *
 * Convention (left → right in LTR):
 *   [danger]   [cancel/ghost]   [primary]
 *
 * Use:
 *   <FormActions>
 *     <Btn variant="danger">Delete</Btn>
 *     <Btn variant="ghost">Cancel</Btn>
 *     <Btn variant="primary" type="submit">Save</Btn>
 *   </FormActions>
 *
 * Alignment override:
 *   align="end"     default — right (LTR) / left (RTL)
 *   align="start"   left / right
 *   align="between" space-between (e.g. danger left, primary right)
 *   align="full"    each button stretches equally
 */
export default function FormActions({
  children,
  align = 'end',
  sticky = false,
  className = '',
  ...rest
}) {
  const cls = [
    'form-actions',
    `form-actions--${align}`,
    sticky ? 'form-actions--sticky' : '',
    className,
  ].filter(Boolean).join(' ');
  return <div className={cls} {...rest}>{children}</div>;
}
