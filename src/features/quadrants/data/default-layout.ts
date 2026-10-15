import type { Quadrant } from "../domain/quadrant";
import type { VenueArea, VenueMap } from "../domain/venue";

/**
 * The quadrants every edition starts with: the planets of the Design System. Served until the admin
 * saves the edition's own (phase 3, module 4). Names and taglines are edition data, in Spanish.
 */
export const DEFAULT_QUADRANTS: readonly Quadrant[] = [
  { id: "cloud", name: "Google Cloud", tagline: "Infraestructura que escala hasta las estrellas", planet: "cloud", order: 0, active: true },
  { id: "firebase", name: "Firebase", tagline: "Lanza tu app a la órbita en minutos", planet: "firebase", order: 1, active: true },
  { id: "android", name: "Android", tagline: "Pilotea la flota de dispositivos", planet: "android", order: 2, active: true },
  { id: "ai", name: "AI", tagline: "Inteligencia para navegar la galaxia", planet: "ai", order: 3, active: true },
  { id: "community", name: "Comunidad GDG", tagline: "La tripulación que hace posible la misión", planet: "gdg", order: 4, active: true },
];

const stand = (id: string, label: string, quadrantId: string, x: number, y: number): VenueArea => ({
  id,
  kind: "stand",
  label,
  quadrantId,
  // 16 units tall: about 50px on a phone, a comfortable touch target.
  rect: { x, y, width: 20, height: 16 },
});

/**
 * A fictional venue for 2026, drawn portrait so it fits a phone: catering at the top, the auditorium in
 * the middle, a column of stands on each side grouped by quadrant, the networking zone below the
 * auditorium and the entrance at the bottom. Plan units: 100 wide by 140 tall.
 */
export const DEFAULT_VENUE: VenueMap = {
  width: 100,
  height: 140,
  areas: [
    { id: "catering", kind: "catering", label: "Catering", quadrantId: null, rect: { x: 28, y: 4, width: 44, height: 14 } },
    { id: "auditorium", kind: "auditorium", label: "Auditorio principal", quadrantId: null, rect: { x: 28, y: 26, width: 44, height: 58 } },
    stand("cloud-1", "Stand Google Cloud 1", "cloud", 4, 20),
    stand("cloud-2", "Stand Google Cloud 2", "cloud", 4, 38),
    stand("firebase-1", "Stand Firebase 1", "firebase", 4, 56),
    stand("firebase-2", "Stand Firebase 2", "firebase", 4, 74),
    stand("community-1", "Stand Comunidad GDG 1", "community", 4, 92),
    stand("android-1", "Stand Android 1", "android", 76, 20),
    stand("android-2", "Stand Android 2", "android", 76, 38),
    stand("ai-1", "Stand AI 1", "ai", 76, 56),
    stand("ai-2", "Stand AI 2", "ai", 76, 74),
    stand("community-2", "Stand Comunidad GDG 2", "community", 76, 92),
    { id: "networking", kind: "service", label: "Zona de networking", quadrantId: null, rect: { x: 28, y: 92, width: 44, height: 28 } },
    { id: "restrooms", kind: "service", label: "Baños", quadrantId: null, rect: { x: 4, y: 118, width: 20, height: 12 } },
    { id: "info", kind: "service", label: "Informes", quadrantId: null, rect: { x: 76, y: 118, width: 20, height: 12 } },
    { id: "entrance", kind: "entrance", label: "Entrada", quadrantId: null, rect: { x: 38, y: 126, width: 24, height: 10 } },
  ],
};
