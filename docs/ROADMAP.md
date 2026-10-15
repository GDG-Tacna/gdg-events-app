# 🚀 Plan de Trabajo Funcional y Temático Revisado

## 🌌 DevFest Tacna 2026 G-App: "Interfaz de Mando"

---

## 🛸 Introducción Temática

Adoptamos la temática de **"Exploración Galáctica"**.

- 🎨 **Estética:** Futurista, limpia y vectorial. Simula el SO de una nave (HUD holográfico).
- 📖 **Narrativa:** Los asistentes son "Cadetes" de la flota. Su misión es explorar áreas tecnológicas y completar "Misiones Activas".
- 🟣 **Visuales:** Modo oscuro (azules profundos y púrpuras) con acentos neón en cian y verde lima.

---

## 🛠️ Fases de Implementación

### 1️⃣ Fase 1: Acceso e Inicialización del Cadete (Cimiento y Base)

- 🔹 Enlace web directo a la "Interfaz de Mando" (cero descargas).
- 🔹 Registro con cuentas existentes y creación de alias de "Cadete".
- 🔹 *[Opcional]* Asignación de Escuadrón: asignación aleatoria a una facción (Angular, Firebase, Gemini) para competencia grupal.
- 🔹 Dashboard inicializado con rango numérico básico y bienvenida del GDG Tacna.

### 2️⃣ Fase 2: Escáner de Salto y Checkpoints Logísticos

- 📷 **Escáner de Salto:** Retícula circular cibernética para escanear QRs físicos.
- ⏱️ **QR Efímero:** QRs proyectados en charlas con solo 2 min de vida, forzando la captura en tiempo real.
- ☕ **Checkpoints de Reabastecimiento:** Escaneo de QR del staff en catering para validar permisos de comida y evitar dobles raciones.
- 🛠️ Gestión de escuadrones por el administrador: crear, editar, activar o retirar y ordenar escuadrones, con su logo en pixel art.
### 3️⃣ Fase 3: Misiones Activas y Cuadrantes Galácticos

- 🗺️ **Mapa Interactivo:** Dividido en "Cuadrantes Galácticos" por tecnología Google.
- 🎯 **Misiones:** Capturar QRs efímeros, visitar sponsors y resolver desafíos.
- 📜 **Odisea de Código:** Narrativa que desbloquea cuadrantes y "comunicaciones" al avanzar.
- ⭐ XP por misión desde esta fase (solo servidor, una vez por misión); los G-Credits siguen en la fase 4.
- 📦 Misiones por defecto: un set inicial de misiones y cuadrantes que el admin carga con un botón en cada edición y luego ajusta.
- 🧩 Creación de misiones por el admin: crear, editar, activar o desactivar y ordenar misiones, eligiendo su tipo (QR de charla, visita a stand, pregunta o palabra clave).
- 🤖 Sugerencias de misiones con IA para el admin (borradores que el admin revisa antes de publicar).
- 🏛️ Mapa: plano del local (ficticio en 2026) con auditorio y stands por cuadrante; pestaña Mapa en la barra inferior, con el botón QR flotando al centro.
- ❓ Preguntas de opción múltiple con dos intentos: el segundo da la mitad del XP. XP por defecto por tipo (QR de charla 50, visita a stand 30, pregunta 40, palabra clave 40), editable en cada misión.
- 🎖️ Rangos editables por el admin (adelantado de la fase 4): nombre y XP mínimo de cada rango por edición; todos se recalculan solos desde su XP.
- 📡 Odisea de Código: cada comunicación de un cuadrante se desbloquea al completar una misión específica (o está abierta desde el inicio); el admin las escribe y hay un set por defecto.

### 4️⃣ Fase 4: Rango, G-Credits y Suministros

- 🎖️ **Rango:** Ascenso progresivo (ej. de "Cadete" a "Nivel 3 - Piloto").
- 🍔 **Bloqueo de Fricción (Comida):**
  - Coffee break: requiere Nivel 2.
  - Almuerzo: requiere escanear asistencia a mín. 3 charlas de la mañana.
- 💎 **Economía:** Progreso en "G-Credits" y recompensas en "XP".
- 🤝 *[Opcional]* Los G-Credits ganados suman al pozo del Escuadrón.
- 🛡️ **Galería de Conquistas:** Insignias vectoriales y de neón.
- 💰 G-Credits del cadete: una billetera global que acumula en todas las ediciones (el XP y el rango siguen siendo por edición). Se ganan por misión (valor por tipo, editable en cada misión) y por asistir a cada charla; solo el servidor los otorga, una vez por fuente. El registro admite salidas para la futura tienda; el saldo nunca queda negativo.
- ⚙️ Economía configurable por edición: G-Credits activados o desactivados, créditos por tipo de misión y por charla; créditos de escuadrón activados o desactivados y su proporción.
- 🔓 Requisitos de comida configurables en cada puesto de catering (nivel mínimo y mínimo de charlas asistidas); por defecto sin restricción (en 2026 el coffee break no pide nivel).
- 🤝 Créditos de escuadrón: una moneda propia de cada escuadrón por edición, separada de los G-Credits del cadete. Se ganan automáticamente cuando un miembro gana G-Credits (proporción configurable, 1 a 1 por defecto) y con bonos del admin con motivo. Solo se canjean por premios que define el admin (nombre, costo, stock, activo); por ahora el canje lo hace el admin desde el Centro de Control.
- 🏅 Insignias por defecto con reglas automáticas; el admin puede activarlas, editarlas y crear nuevas eligiendo un tipo de regla y sus parámetros. Pantalla "Logros" en la barra inferior.

### 5️⃣ Fase 5: Mini-juegos y Red de Cadetes (Táctica Avanzada)

- 🕹️ **Mini-juegos Arcade:** Se activan al escanear ciertos checkpoints para duplicar puntos.
  - Son un bonus encima de una misión, no un tipo de misión: ganar duplica el XP de la misión y perder conserva el XP base.
  - Unos 5 mini-juegos construidos; el admin habilita o deshabilita cada uno por edición (por ejemplo solo 2 o 3) y elige en qué misiones aparece.
  - Elegidos para esta fase (2026-10-10): Bug Kong (plataformas al estilo Donkey Kong: un bug gigante lanza excepciones), Invasores de bugs, Conecta los circuitos, Ordena el código (JavaScript/TypeScript y Python, se tocan las líneas en orden, sin escribir) y Salto en el momento justo. Un solo intento, duración según el juego (máximo 90 s), dificultad fácil/normal/difícil por juego y edición, ajustable por misión. Detalle en `docs/minigames.md`.
  - Anotados para ediciones futuras: Esquiva meteoritos, Tiro al asteroide, Recolector de estrellas, Secuencia de señales, Laberinto de agujero de gusano, Aterrizaje lunar, Nave entre asteroides, Apila la estación, Caza el bug, Teclea el comando (con botones de palabras) y Trivia relámpago (5 preguntas sí/no contra reloj).
- 🌐 **Networking:** Escaneo de códigos de otros Cadetes para armar red de contactos.

### 🔧 Fase 5.5: Pruebas reales y ajustes de UI/UX

- 🧪 **Prueba integrada:** la app completa contra Firebase real, con una sesión de admin, teléfonos reales (cámara, controles táctiles de los mini-juegos, dos teléfonos para la Red) y Gemini para las sugerencias.
- 📝 **Bitácora de ajustes:** el organizador recorre cada pantalla (cadete, staff y centro de control), la marca como "Bien" o "Ajustar" y deja notas con tipo (UI, UX, error, idea), prioridad y captura. La bitácora es una página privada en claude.ai que Claude lee para convertir las notas en tareas.
- 🎨 **Ajustes de UI y UX:** se rediseñan las pantallas marcadas, tanto en la app del cadete como en el centro de control, agrupadas por módulo y ordenadas por prioridad; cada ajuste se revisa en el teléfono antes de cerrarlo.
- ✅ La fase se cierra cuando todas las pantallas están en "Bien" y no quedan notas de prioridad alta abiertas.
- 🐞 Primera revisión (2026-10-12), errores corregidos: el login, la pantalla del escenario ("conectando") y el cierre de sesión del staff fallaban por una validación rota de la configuración del cliente; faltaba el índice `participants (squad, xp)` de los totales por escuadrón; el pase no se generaba porque faltaba `QR_SIGNING_SECRET` en el entorno local; sin escuadrones cargados, el cadete caía en un 404 después del alias (ahora pasa al Inicio).
- 📋 Decisiones del organizador (2026-10-12) para los ajustes, en este orden de bloques:
  1. **QR y staff** (primero): cada cadete tiene un QR personal en su perfil; el staff lo escanea en la entrada, el catering y los stands; el cadete escanea solo los QR de charlas y los códigos de contacto. Se usan `qrcode` para generar y `@yudiel/react-qr-scanner` para leer. Nuevo módulo de Charlas en el admin, con el QR de cada charla.
  2. **Rediseño del cadete:** Inicio con la tarjeta del cadete más angosta (según la referencia), avatar pixel art 16 bits HD, logo de GDG Tacna en 16 bits, tarjetas de misión con ícono y etiquetas (mini-juego, cuadrante).
  3. **Centro de control:** formularios de edición en modales (shadcn), listados mejorados, buscadores, ordenar arrastrando, panel de inicio con estadísticas de la edición y accesos con íconos, vista previa de los mini-juegos en un modal.
  4. **Imágenes subidas** (validadas por el servidor; los clientes no escriben): logros, premios del sorteo y del escuadrón, logo del escuadrón, ícono de rango y de misión, plano SVG con áreas. Se guardan en Firestore y la app las sirve en `/media` (decisión del 2026-10-13: Storage exige el plan Blaze y no hacen falta muchas imágenes).
  5. **Equipo por edición:** nuevo rol `organizer` (como admin, sin agregar admins ni crear eventos), buscador, quitar el rol con un ícono e invitaciones por correo con Resend (link de acceso).
  - ✅ Nombre genérico para "Odisea" (2026-10-14): la sección se llama "Historia" y cada edición escribe el título de su historia (2026: "Odisea de Código"); sin título los cadetes ven "Historia".
  - ✅ Bloque 1 (QR y staff) construido en código el 2026-10-12: el staff escanea el QR del cadete en entrada, catering y stands (los QR impresos se retiraron); lector `@yudiel/react-qr-scanner` con el decodificador servido por la propia app; botón de QR en la tarjeta del cadete; módulo Charlas (ponente, horario, sala, descripción y QR) y la Agenda dentro de Mapa. Pendiente: probarlo con teléfonos y Firebase real.
  - ✅ Bloque 2 (rediseño del cadete) construido en código el 2026-10-12: avatar pixel art 16 bits HD generado del alias, logo de GDG Tacna en 16 bits en la marca ("DevFest" en fuente pixel, permitida desde ahora en el logotipo y los encabezados), Inicio como terminal arcade según la referencia (menú de cuenta y cerrar sesión arriba), tarjetas de misión con ícono y etiquetas (tipo, cuadrante, mini-juego). Pendiente: revisarlo en el teléfono.
  - ✅ Bloque 3 (centro de control) construido en código el 2026-10-13: inicio con estadísticas de la edición y accesos con íconos; formularios de crear y editar en modales sobre su lista; ediciones pequeñas (puestos, premios del sorteo y del escuadrón) en modales; misiones, escuadrones, cuadrantes, Odisea y logros se ordenan arrastrando (o con las flechas del teclado); Mini-juegos con buscador y botón "Probar" que abre el juego en un modal sin dar XP; Economía y Mini-juegos dicen a qué edición se aplican. Pendiente: revisarlo con una sesión de admin real y el arrastre en pantalla táctil.
  - ✅ Bloque 4 (imágenes) construido en código el 2026-10-13: imagen opcional en logros, premios del sorteo (también en el escenario) y del escuadrón, logo subido del escuadrón (imagen o SVG limpio, o su dibujo pixel art), ícono por rango en la tarjeta del cadete, imagen de misión, y el plano real del local bajo las áreas del mapa (PDF convertido a SVG con `npm run venue:pdf` en la computadora del organizador). Las imágenes viven en Firestore, sin Blaze. Pendiente: probarlo con el proyecto real y el PDF del local.
  - ✅ Bloque 5 (equipo por edición) construido en código el 2026-10-14: staff y organizer por edición (admin global), invitaciones por enlace de un solo uso (7 días, para un correo; Resend listo para activarse), pantalla Equipo con buscador e ícono para quitar el rol. Pendiente: probarlo con cuentas reales.
  - 🧪 Lista de la prueba integrada (2026-10-14): página privada con 39 pasos para marcar con teléfonos reales.
- 🗂️ **Bloque 6: varios eventos en la misma app** (decisiones del organizador, 2026-10-14; se construye ahora, antes de la prueba integrada). Se queda en esta app (los datos ya viven por edición); no se hace otra app.
  - Un solo evento en vivo a la vez para los cadetes; los demás se preparan en borrador. Varios eventos simultáneos quedan para después (el cadete entraría por el enlace o código del evento).
  - Solo el admin global crea eventos; el organizer gestiona el suyo.
  - Módulos, en este orden:
    1. **Eventos:** lista de ediciones con estado (borrador, en curso, finalizado), crear un evento (nombre, identificador, fechas, lugar) y "Hacer público" desde el centro de control en vez de la consola de Firebase; auditado.
    2. **Edición de trabajo:** selector en el centro de control para preparar un evento mientras otro está en vivo; el organizer y el staff entran a los eventos donde están en el equipo aunque no sean el público.
    3. **Copiar desde otro evento:** escuadrones, misiones, rangos, economía, logros, mini-juegos, historia, mapa y charlas; nunca cadetes, escaneos ni resultados.
    4. **Módulos por evento:** interruptores (misiones, mapa, historia, logros, mini-juegos, red, ranking, sorteo, escuadrones, charlas, G-Credits) con sus dependencias; un módulo apagado se oculta y el servidor rechaza sus acciones.
    5. **Permisos por evento:** qué secciones ve o edita el organizer y qué puestos opera el staff, de una lista cerrada que el servidor verifica; por defecto como hoy.
    6. (Opcional) nombre y frase de la marca por evento.
  - ✅ Módulos 1 a 5 construidos en código el 2026-10-14: Eventos (crear, editar, finalizar, hacer público), edición de trabajo (selector en el centro de control, "Tus eventos" para organizer y staff de un evento que aún no está en curso, invitaciones con su evento), copiar contenido de otro evento (con imágenes propias), módulos por evento (interruptores con dependencias) y permisos por evento (organizer por sección: No ve, Ve, Edita; staff por tipo de puesto). Pendiente: el módulo 6 opcional y probarlo todo con el proyecto real.

### 6️⃣ Fase 6: Despliegue Final y Leaderboard (Cierre)

- ⚙️ Optimización total para carga masiva simultánea.
- 🏆 **HUD Principal:** Leaderboard en el escenario principal mostrando a los líderes (y escuadrones).
- 🎁 Sincronización de G-Credits para el sorteo final de Swag.
- 📋 Decisiones del organizador (2026-10-11):
  - La pantalla del escenario muestra cadetes y escuadrones; los cadetes se ordenan por XP de la edición y los escuadrones por el XP total de sus miembros. Se actualiza en tiempo real.
  - El admin la controla desde el Centro de Control: pausa (pantalla de espera), congelar el ranking antes del cierre, elegir la vista (cadetes, escuadrones o ambos) y la revelación animada de los campeones.
  - Cada cadete ve en la app su puesto ("Vas #23 de 280") y el top 10.
  - Sorteo en la app y en la pantalla grande: cada G-Credit ganado en la edición es un boleto (no se gastan), con un mínimo para participar que define el admin (1 por defecto). El admin define los premios y lanza cada sorteo; un ganador no repite y todo queda registrado.
  - Carga esperada: hasta 300 asistentes (se prueba con el doble). El despliegue (Firebase App Hosting o Vercel) se decide al final de la fase.
- 🔧 La fase 5.5 (pruebas y ajustes con la bitácora) sigue abierta en paralelo.
- ✅ Construida en código el 2026-10-11: ranking (en la app y en el escenario), control "Escenario", pantalla del escenario en tiempo real, sorteo y preparación para el despliegue (`docs/deploy.md`). Pendiente: correr la prueba de carga en un proyecto de prueba y elegir entre Firebase App Hosting y Vercel.

### 7️⃣ Fase 7 (futura, sin fecha): Tienda virtual

- 🛒 Los cadetes canjean sus G-Credits acumulados (billetera global de todas las ediciones) por artículos de una tienda virtual.
- ❓ Por decidir: si la tienda será parte de esta app o una app aparte. No se desarrolla por ahora; la billetera de la Fase 4 ya admite salidas para que la tienda solo agregue su catálogo y el canje.
