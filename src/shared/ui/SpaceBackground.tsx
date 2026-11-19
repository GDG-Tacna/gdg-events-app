/**
 * Page backdrop: the flat coal canvas of the DevFest Tacna site (no gradient, nebulae or stars since 2026-11-17).
 * Decorative and static, so it needs no reduced-motion handling.
 */
export function SpaceBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden print:hidden">
      <div className="absolute inset-0" style={{ background: "var(--bg)" }} />
    </div>
  );
}
