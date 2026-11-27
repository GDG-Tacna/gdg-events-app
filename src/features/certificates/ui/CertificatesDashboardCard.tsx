import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { ButtonLink, Card, Icon } from "@/shared/ui";

export interface CertificatesDashboardCardProps {
  claimableCount: number;
  issuedCount: number;
  href: string;
}

const t = copy.certificates.dashboardCard;

/** Compact dashboard card pointing signed-in users to their certificates portal (`/certificados`). */
export function CertificatesDashboardCard({ claimableCount, issuedCount, href }: CertificatesDashboardCardProps) {
  const description =
    claimableCount === 1
      ? t.claimableOne
      : claimableCount > 1
        ? interpolate(t.claimableMany, { n: String(claimableCount) })
        : issuedCount === 1
          ? t.issuedOne
          : issuedCount > 1
            ? interpolate(t.issuedMany, { n: String(issuedCount) })
            : t.idle;

  return (
    <Card tone={claimableCount > 0 ? "cyan" : undefined} className="gap-space-3 flex flex-col">
      <div className="gap-space-3 flex items-start justify-between">
        <div className="gap-space-1 flex flex-col">
          <h3 className="type-title text-foreground gap-space-2 flex items-center">
            <Icon name="certificate" size={20} className="text-cyan-ink" />
            {t.title}
          </h3>
          <p className="type-body-sm text-muted-foreground">{description}</p>
        </div>
        {claimableCount > 0 ? (
          <span className="bg-lime text-on-accent type-caption rounded-pill px-space-2 py-0.5 font-semibold">{claimableCount}</span>
        ) : null}
      </div>
      <ButtonLink href={href} variant={claimableCount > 0 ? "primary" : "secondary"} size="sm" className="self-start">
        {t.open}
      </ButtonLink>
    </Card>
  );
}
