import type { Metadata } from "next";
import Link from "next/link";
import { adminAreaCards } from "@/app-shell/admin-nav";
import { insightsDeps } from "@/app-shell/composition/insights.server";
import { requireRole } from "@/app-shell/guards";
import { moduleSwitches } from "@/app-shell/modules.server";
import { sectionLevels } from "@/app-shell/permissions.server";
import { InsightsPanel } from "@/features/insights";
import { getInsights } from "@/features/insights/server";
import { copy } from "@/shared/copy/es";
import { Icon, InlineAlert, ScreenEnter } from "@/shared/ui";

export const metadata: Metadata = { title: copy.admin.nav.home };

export default async function AdminHomePage() {
  const session = await requireRole(["admin"]);
  // The numbers decorate the home: if they cannot be read, the shortcuts still work.
  const [insights, modules, levels] = await Promise.all([getInsights(insightsDeps, { uid: session.uid, role: session.role }), moduleSwitches(), sectionLevels(session)]);

  return (
    <ScreenEnter>
      <div className="gap-space-6 flex flex-col">
        <header className="gap-space-1 flex flex-col">
          <h1 className="type-title-xl text-foreground">{copy.admin.home.title}</h1>
          <p className="type-body text-muted-foreground">{copy.admin.home.intro}</p>
        </header>

        {insights.ok ? <InsightsPanel overview={insights.value} /> : <InlineAlert>{copy.admin.home.error}</InlineAlert>}

        <section aria-labelledby="admin-shortcuts" className="gap-space-3 flex flex-col">
          <h2 id="admin-shortcuts" className="type-pixel-heading text-cyan">
            {copy.admin.home.shortcutsTitle}
          </h2>
          <ul className="gap-space-3 grid grid-cols-2 min-[560px]:grid-cols-3 min-[1024px]:grid-cols-5">
            {adminAreaCards((module) => modules[module], levels).map((area) => (
              <li key={area.href}>
                <Link
                  href={area.href}
                  title={area.description}
                  className="bg-surface border-border hover:border-cyan focus-visible:ring-ring gap-space-2 p-space-4 flex h-full flex-col items-center rounded-lg border text-center transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
                >
                  <span aria-hidden="true" className="border-cyan/40 text-cyan bg-bg-deep grid size-12 place-items-center rounded-md border">
                    <Icon name={area.icon} size={22} />
                  </span>
                  <span className="type-label text-foreground">{area.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </ScreenEnter>
  );
}
