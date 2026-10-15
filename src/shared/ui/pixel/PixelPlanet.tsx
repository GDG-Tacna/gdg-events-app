import { PixelSprite } from "./PixelSprite";
import { planetSprite, type PlanetKind } from "./planet-sprites";

export type { PlanetKind } from "./planet-sprites";

export interface PixelPlanetProps {
  kind?: PlanetKind;
  /** Integer scale: 1 art pixel = `scale` screen pixels. */
  scale?: number;
  title?: string;
  className?: string;
}

export function PixelPlanet({ kind = "gdg", scale = 3, title, className }: PixelPlanetProps) {
  const sprite = planetSprite(kind);
  return <PixelSprite rows={sprite.rows} palette={sprite.palette} scale={scale} title={title} className={className} />;
}
