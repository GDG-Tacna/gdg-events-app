import type { Communication } from "../domain/communication";

/**
 * The transmissions every edition starts with: per quadrant, an opening one and one that a mission opens
 * (the default missions of `features/missions`). Served until the edition saves its own; the admin seeds
 * and edits them in Odisea. The story is edition data, in Spanish.
 */
const comm = (id: string, quadrantId: string, order: number, title: string, body: string, unlockMissionId: string | null): Communication => ({
  id,
  quadrantId,
  order,
  title,
  body,
  unlockMissionId,
  active: true,
});

export const DEFAULT_COMMUNICATIONS: readonly Communication[] = [
  comm(
    "mando-bienvenida",
    "community",
    0,
    "Mensaje del Mando",
    "Cadete, bienvenido a la flota del DevFest Tacna. La galaxia del código está dividida en cuadrantes y cada uno guarda señales que solo los exploradores pueden descifrar. Cumple misiones, escanea los QR y reúne las transmisiones perdidas.",
    null,
  ),
  comm(
    "mando-inaugural",
    "community",
    1,
    "Coordenadas de la travesía",
    "La charla inaugural fijó el rumbo: aprender juntos, compartir lo que sabemos y construir comunidad. Esa es la energía que mueve a toda la tripulación del GDG.",
    "keynote",
  ),
  comm(
    "cloud-senal",
    "cloud",
    10,
    "Señal desde la nube",
    "Una estación orbital transmite desde Google Cloud: aquí los servicios escalan solos cuando llega la tormenta de usuarios. Visita su stand para fijar la frecuencia.",
    null,
  ),
  comm(
    "cloud-descifrada",
    "cloud",
    11,
    "Bitácora de la estación orbital",
    "Frecuencia fijada. La estación confirma que desplegar en minutos y pagar solo por lo que se usa es el combustible de las misiones más largas.",
    "cloud-stand",
  ),
  comm(
    "firebase-senal",
    "firebase",
    20,
    "Llamarada en el radar",
    "Desde el sector Firebase llega una llamarada: apps que despegan con autenticación, base de datos y hosting listos. Visita su stand para seguir la señal.",
    null,
  ),
  comm(
    "firebase-descifrada",
    "firebase",
    21,
    "Bitácora del sector Firebase",
    "Señal descifrada. Los pilotos de Firebase lanzan una idea a producción antes de que se enfríen los motores.",
    "firebase-stand",
  ),
  comm(
    "android-senal",
    "android",
    30,
    "La flota verde",
    "Miles de naves Android cruzan la galaxia. Su capitanía está en el stand de Android: visítalo para unirte a la formación.",
    null,
  ),
  comm(
    "android-descifrada",
    "android",
    31,
    "Bitácora de la flota verde",
    "Bienvenido a la formación. La flota se mantiene unida con interfaces declarativas y una comunidad que comparte cada mejora.",
    "android-stand",
  ),
  comm(
    "ai-senal",
    "ai",
    40,
    "Una inteligencia despierta",
    "En el cuadrante AI una inteligencia aprende de cada transmisión. Visita su stand para conversar con ella.",
    null,
  ),
  comm(
    "ai-descifrada",
    "ai",
    41,
    "Bitácora de la inteligencia",
    "Conversación establecida. La inteligencia recuerda que los mejores modelos se construyen con datos responsables y personas curiosas.",
    "ai-stand",
  ),
];
