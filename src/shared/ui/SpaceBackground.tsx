/** [left %, top %, size px] of the scattered pixel stars. Fixed positions keep server and client renders identical. */
const STARS: ReadonlyArray<readonly [number, number, number]> = [
  [8, 12, 2], [22, 28, 2], [35, 8, 2], [48, 18, 4], [61, 6, 2], [74, 22, 2],
  [90, 10, 2], [15, 46, 2], [30, 62, 2], [52, 52, 2], [68, 44, 4], [84, 58, 2],
  [10, 80, 2], [40, 88, 2], [64, 76, 2], [92, 84, 2],
];

/**
 * Space backdrop: deep blue to violet gradient, two faint nebulae and a few pixel stars.
 * Decorative and static, so it needs no reduced-motion handling.
 */
export function SpaceBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden print:hidden">
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, var(--bg) 0%, var(--bg-violet) 100%)" }}
      />
      <div
        className="absolute -top-24 -left-24 size-96 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--violet), transparent 70%)" }}
      />
      <div
        className="absolute -right-24 bottom-0 size-96 rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--cyan), transparent 70%)" }}
      />
      {STARS.map(([left, top, size]) => (
        <span
          key={`${left}-${top}`}
          className="bg-foreground/70 absolute"
          style={{ left: `${left}%`, top: `${top}%`, width: size, height: size }}
        />
      ))}
    </div>
  );
}
