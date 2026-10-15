# Despliegue y preparación para el evento

Guía operativa de DevFest Space Arcade para el día del evento: cuánto lee cada pantalla, cómo publicar la app (Firebase App Hosting o Vercel), cómo correr la prueba de carga y la lista de verificación final. Escrita el 2026-10-11 (fase 6, módulo 5).

## 1. Lecturas de Firestore por pantalla

Lecturas aproximadas por **visita de un cadete**, después de las cachés del servidor. Los catálogos (misiones, cuadrantes, plano, escuadrones, rangos, insignias, economía, transmisiones) se guardan 1 minuto por instancia; el top del ranking, el total de cadetes y los totales de escuadrón, 10 segundos. Una consulta de conteo (`count()`) o de suma (`sum()`) cuesta 1 lectura por cada 1000 entradas del índice.

| Pantalla | Lecturas por visita | Detalle |
|---|---|---|
| Inicio | 9 + premios de escuadrón | perfil, billetera, monedero del escuadrón y sus premios, conteo de contactos, tu puesto (perfil + 2 conteos), ajustes del sorteo y tus sorteos |
| Misiones | 1 + tus misiones intentadas | el tablero viene de la caché |
| Detalle de misión | 2 + tus misiones intentadas | + la partida del mini-juego |
| Escanear un QR | 8 a 15 | el registro, las misiones del puesto, la recompensa y la revisión de logros |
| Logros | 6 + tus misiones + tus insignias | progreso: misiones, charlas, stands, perfil, contactos |
| Mapa / Odisea | 1 + tus misiones intentadas | el plano y las transmisiones vienen de la caché |
| Red | 2 + 3 por contacto | tus contactos, su alias, escuadrón y enlaces |
| Pantalla del escenario | 1 por cadete al abrirla, luego 1 por cada cambio de XP | una sola pantalla escucha en vivo |
| Admin "Sorteo" | 1 por cadete por sorteo | solo el admin, unas pocas veces |

**Estimación del día** con 300 cadetes que abren unas 40 pantallas cada uno: del orden de 120 000 a 150 000 lecturas, más la pantalla del escenario (unas pocas decenas de miles en una jornada). Supera la cuota gratuita diaria del plan Spark, así que **el proyecto del evento debe estar en el plan Blaze** (pago por uso). Revisa los precios y cuotas vigentes en la consola de Firebase antes del evento y pon una **alerta de presupuesto** en Google Cloud Billing.

Ajustes hechos en esta revisión: la tarjeta del sorteo leía todos los sorteos de la edición en cada visita al Inicio; ahora lee solo los del cadete. El conteo de contactos (tarjeta Red del Inicio y progreso de Logros, que también se revisa en cada escaneo) leía todos los contactos del cadete; ahora es una agregación `count()` de 1 lectura (2026-10-11, auditoría de Firestore). Los premios del escuadrón y el mínimo del sorteo que muestra el Inicio, y los ajustes de mini-juegos que muestran el detalle de misión y la pantalla del juego, se guardan 1 minuto por instancia. Lo que decide (canjear, sortear, iniciar o cerrar una partida) siempre lee el dato guardado, y el panel de admin también.

## 2. Antes de publicar (las dos opciones)

1. **Proyecto de Firebase del evento** con Authentication (proveedor Google) y Firestore (las imágenes también van en Firestore, sin Storage). Para las pruebas basta el plan Spark; para el día del evento hace falta Blaze por el volumen de lecturas (sección 1), y App Hosting lo exige siempre.
2. **Dominios autorizados** (Authentication > Settings > Authorized domains): agrega el dominio final de la app.
3. **Reglas e índices** de Firestore, desde la carpeta del proyecto con la CLI de Firebase:
   ```
   npm install -g firebase-tools
   firebase login
   firebase deploy --only firestore:rules,firestore:indexes --project <id-del-proyecto>
   ```
   El índice `participants (xp, xpReachedAt)` lo usa "Tu puesto" y `participants (squad, xp)` los totales por escuadrón del ranking y del escenario; tardan unos minutos en construirse después del despliegue.
4. **Secretos del servidor** (nunca `NEXT_PUBLIC_`):
   - `QR_SIGNING_SECRET`: 32 caracteres o más. Genéralo con `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
   - `GEMINI_API_KEY`: de Google AI Studio (solo para "Sugerir con IA").
5. **Primer admin**: entra una vez a la app publicada con tu cuenta y corre `npm run admin:first -- tucorreo@gmail.com` (con `.env.local` apuntando al proyecto del evento).

## 3. Opción A: Firebase App Hosting

- Configuración en `apphosting.yaml`: una instancia siempre encendida (sin arranque en frío en la puerta), hasta 6 instancias, 80 solicitudes simultáneas por instancia.
- Reemplaza los cuatro valores `REPLACE_WITH_…` por la configuración web del proyecto (Project settings > General > Your apps).
- Crea los secretos una sola vez:
  ```
  firebase apphosting:secrets:set qr-signing-secret
  firebase apphosting:secrets:set gemini-api-key
  ```
- Crea el backend (Firebase console > App Hosting > conectar el repositorio de GitHub, rama `main`). Cada push publica una versión nueva.
- No hace falta la clave de cuenta de servicio: en App Hosting el servidor usa la cuenta propia del backend.
- Cambia `BUILD_ID` en cada despliegue para que los teléfonos vean el aviso de nueva versión.

## 4. Opción B: Vercel

- Importa el repositorio en Vercel (framework Next.js, sin cambios de build).
- Variables de entorno (Settings > Environment Variables), en Production:
  - Públicas: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`.
  - Servidor: `FIREBASE_SERVICE_ACCOUNT_KEY` (el JSON en una línea; en Vercel sí hace falta), `QR_SIGNING_SECRET`, `GEMINI_API_KEY`.
  - `BUILD_ID`: puedes usar el commit de cada despliegue.
- Región de las funciones: elige la más cercana a la región de Firestore del proyecto.

## 5. Prueba de carga (con un proyecto de PRUEBA)

La prueba crea cadetes falsos, así que **nunca se corre contra el proyecto del evento**: usa un proyecto de prueba con su propio despliegue. Los scripts se niegan a correr si el proyecto no se nombra a propósito y se confirma.

1. Apunta `.env.local` al proyecto de prueba (su clave de servicio y su configuración web) y publica la app de prueba.
2. Crea 600 cadetes de prueba (el doble de los 300 esperados):
   ```
   LOAD_TEST_PROJECT=<id-de-prueba> LOAD_TEST_CONFIRM=yes npm run load:seed
   ```
3. Corre la prueba: cada cadete inicia sesión como en la app y navega Inicio, Misiones, Logros, Mapa, Red y Odisea con pausas de 3 a 10 s durante 5 minutos:
   ```
   LOAD_TEST_PROJECT=<id-de-prueba> LOAD_TEST_CONFIRM=yes LOAD_TEST_URL=https://<app-de-prueba> npm run load:run
   ```
   Aprueba si el 95 % de las respuestas tarda menos de 1.5 s y fallan menos del 1 %. Se ajusta con `LOAD_TEST_P95_MS`, `LOAD_TEST_MAX_ERRORS`, `LOAD_TEST_SECONDS` y `LOAD_TEST_CADETS`.
4. Revisa en la consola de Firebase las lecturas del período (Firestore > Usage) para confirmar la estimación de la sección 1.
5. Borra los cadetes de prueba:
   ```
   LOAD_TEST_PROJECT=<id-de-prueba> LOAD_TEST_CONFIRM=yes npm run load:cleanup
   ```

## 6. Lista para el día del evento

- [ ] Reglas e índices desplegados; los dos índices de `participants` en estado "Enabled".
- [ ] Plan Blaze activado antes del día (por las lecturas) y alerta de presupuesto.
- [ ] Prueba de carga aprobada en el proyecto de prueba.
- [ ] Puestos creados y abiertos (entrada, stands, catering) y charlas con su QR proyectado o impreso; el staff escanea el QR personal del cadete.
- [ ] Misiones cargadas, mini-juegos asignados, logros activos, economía revisada.
- [ ] Premios del sorteo definidos y mínimo de G-Credits configurado.
- [ ] Equipo de la edición con su rol o invitación aceptada (Centro de Control > Equipo).
- [ ] Título de la historia escrito (Centro de Control > Historia), por ejemplo «Odisea de Código».
- [ ] En Centro de Control > Eventos, el evento real figura «En curso» (los de prueba, finalizados) y el selector «Evento de trabajo» está en él.
- [ ] Módulos y Permisos del evento real revisados (Eventos > Módulos / Permisos): todo lo que se usará encendido y el staff con los tipos de puesto que opera.
- [ ] Computador del proyector: sesión de admin abierta, `/escenario` en pantalla completa, probado con la red del local.
- [ ] Antes del cierre: Escenario > "Congelar ranking", luego "Revelar campeones", luego el sorteo desde "Sorteo".
