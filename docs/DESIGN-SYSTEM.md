# DevFest Space Arcade

**Odisea de Código** es la PWA de gamificación de DevFest Tacna 2026. Los asistentes son **Cadetes Espaciales** a bordo de la nave **GDG Tacna Enterprise**: exploran planetas tecnológicos, completan misiones, ganan XP Estelar y combaten la **Lógica Obsoleta** hasta convertirse en Leyenda Estelar.

La idea visual: **un arcade de los 90 reinterpretado como una PWA moderna de 2026**.

> **Actualización vigente desde 2026-11-17.** El aspecto de la app se alineó con el sitio de DevFest Tacna y ganó tema claro. Lo que dice la sección «Actualización 2026-11-17» (más abajo) **manda sobre** las secciones de fondo, cards, color, tipografía, sombras, brillos y componentes que describen el look «arcade espacial» oscuro de octubre: esas se conservan como historia y para los nombres de tokens, que no cambiaron.

## Actualización 2026-11-17: look del sitio DevFest Tacna y tema claro u oscuro

Origen: dos cambios de estilo de Angelo Leva, fusionados en el PR #16 (`32fe773`, «match the look and feel of the DevFest Tacna site») y el PR #17 (`9f9e2df`, «add the light theme»). Referencia visual: devfest.gdgtacna.com. Es un cambio **solo visual**: los nombres de los tokens se mantienen, así que los componentes y las features no cambiaron de API.

### Qué cambió

| Aspecto | Antes (arcade espacial oscuro) | Ahora |
|---|---|---|
| Tema | Solo oscuro, sin selector | **Claro** como base (`:root`) y **oscuro** con la clase `.dark` en `<html>`. Sigue al sistema hasta que la persona elige con el botón de tema (`ThemeToggle`); la elección se guarda en `localStorage` con la clave `theme`, la misma del sitio |
| Fondo | Degradado azul a violeta, dos nebulosas y estrellas pixel | **Plano**: `bg` liso (carbón en oscuro, gris claro en claro). `SpaceBackground` ya no dibuja nebulosas ni estrellas |
| Cards y paneles | `surface` con borde `line` de 1 px, brillo superior y `shadow-card` | Paneles **planos** con borde de **2 px** `ink`; la card resaltada (`tone="cyan"`) cambia el borde a `cyan` en lugar de añadir brillo. Sin sombra |
| Botón primario | Relleno cian | **Píldora `ink` sólida** (texto `on-ink`) con borde de 2 px; al pasar el cursor se vuelve amarillo Google (`gold`) con texto `on-accent` |
| Botón secundario | Transparente con borde fino | Fondo `surface`, borde de 2 px `ink`, hover `pastel-blue`. El peligro (`danger`) tiene hover `pastel-red` |
| Forma | Radios 10 / 14 / 20 px, botones con `radius-md` | Radios **12 / 16 / 24 px**; los botones son **píldora** (`radius-pill`), semibold |
| Brillos | `glow-cyan`, `glow-magenta` y `glow-gold` con halo difuso | Siguen existiendo con el mismo nombre pero son un **anillo sólido de 2 px** (`#57caff`, `#ff7daf`, `#f9ab00`), sin halo |
| Tipografía | Space Grotesk, Inter y Tiny5 | **Google Sans** (títulos y texto) y **Google Sans Code** (etiquetas), las mismas del sitio. Ya no se carga Tiny5 |
| Títulos | Peso 600 y sin ajuste de espaciado | Peso 700 y espaciado negativo (`type-title-xl` y `type-pixel-title`: -0,02 a -0,03 em; `type-title`: -0,01 em) |

### Paleta por tema

Rellenos de acento (`bg-*`) iguales en los dos temas: `cyan` #57CAFF (azul medio tono), `violet` #4285F4 (azul Google), `violet-soft` #8AB4F8, `magenta` #FF7DAF, `lime` #5CDB6D, `gold` #F9AB00 (amarillo Google), `danger` #F28B82. `on-accent` es #1E1E1E en los dos.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `bg-deep` | #E2E2E2 | #171717 | Fondo de campos y huecos |
| `bg` | #F0F0F0 | #1E1E1E | Fondo de la app (`bg-violet` vale lo mismo: ya no hay degradado) |
| `surface` | #FFFFFF | #2A2A2A | Cards y paneles |
| `surface-raised` | #E2E2E2 | #383838 | Pista de barras, elementos elevados |
| `line` | #1E1E1E (14 %) | #F0F0F0 (16 %) | Borde decorativo |
| `line-strong` | #1E1E1E (40 %) | #F0F0F0 (42 %) | Borde de controles |
| `ink` | #1E1E1E | #F0F0F0 | Borde de 2 px y relleno del botón primario (`primary` = `ink`) |
| `on-ink` | #F0F0F0 | #1E1E1E | Texto sobre `ink` (`primary-foreground`) |
| `text` | #1E1E1E | #F0F0F0 | Texto principal |
| `text-muted` | #555555 | #C6C6C6 | Texto secundario |
| `text-subtle` | #696969 | #A0A0A0 | Metadatos |

**Pasteles de hover** (iguales en ambos temas, con texto carbón): `pastel-blue` #C3ECF6, `pastel-green` #CCF6C5, `pastel-yellow` #FFE7A5, `pastel-red` #F8D8D8. La pestaña activa de la barra inferior es una píldora `pastel-yellow`.

### Regla de color: relleno o texto

- **Relleno o borde:** los acentos brillantes (`bg-cyan`, `bg-gold`, `border-cyan`...), iguales en los dos temas.
- **Texto de acento:** los tokens nuevos `*-ink`, que en el tema claro son más oscuros para leerse sobre el fondo claro. Ya no se usa `text-cyan`, `text-lime`, `text-gold`, `text-violet-soft` ni `text-danger` para escribir texto.

| Token | Claro | Oscuro |
|---|---|---|
| `cyan-ink` | #1A56C4 | #57CAFF |
| `violet-ink` | #1A56C4 | #4285F4 |
| `violet-soft-ink` | #1A56C4 | #8AB4F8 |
| `magenta-ink` | #B3261E | #FF7DAF |
| `lime-ink` | #1B7430 | #5CDB6D |
| `gold-ink` | #855C00 | #F9AB00 |
| `danger-ink` | #B3261E | #F28B82 |

### Componentes tocados

- **Button, Card, TextField, RankChip, ProgressBar:** como arriba. El campo de texto lleva borde de 2 px `line-strong` y al enfocarse pasa a `ink`. La barra de progreso rellena de `violet` a `lime` a `gold` (es el único degradado que queda). `RankChip` muestra «NV n» en `gold` con borde `ink`.
- **BottomNav:** borde superior de 2 px `ink`; pestaña activa `pastel-yellow` con texto carbón; el botón central de escanear es `gold` con borde `ink` y hover `pastel-yellow`.
- **PlayerCard:** marco `ink` de 2 px, avatar sobre `pastel-blue` y la insignia de edición en `gold`.
- **ThemeToggle** (nuevo, `shared/ui`): botón redondo de 48 px con borde `ink` y icono de sol o luna; hover `pastel-yellow`. Va en la cabecera de los visitantes (`AttendeeShell`), en la del staff (`StaffShell`), junto a «Salir» en el admin y arriba a la derecha en el inicio de sesión. No está en el escenario (proyector) ni en el onboarding.
- **Estilos `type-pixel-*`:** conservan el nombre para no tocar las pantallas, pero ya no son pixel. `type-pixel-title` y `type-pixel-callout` son Google Sans 700 con espaciado negativo; `type-pixel-heading` es una etiqueta en Google Sans Code, mayúsculas, 12 px y espaciado de 0,12 em; `type-pixel-tag` es Google Sans Code 14 px semibold («+100 XP», «NV 3»). El **pixel art** (avatar, nave, planetas, medallas, moneda, estrella, marca de GDG Tacna) no cambió.
- **PWA:** el color de la barra de estado (`themeColor`) sigue al tema: #F0F0F0 en claro y #1E1E1E en oscuro. El manifiesto conserva #1E1E1E para el fondo y el color de tema de la app instalada.

### Contraste calculado (2026-11-18, WCAG 2.1)

| Par | Claro | Oscuro |
|---|---|---|
| `text` sobre `bg` / `surface` | 14,6 / 16,7 | 14,6 / 12,6 |
| `text-muted` sobre `bg` / `surface` | 6,5 / 7,5 | 9,8 / 8,4 |
| `text-subtle` sobre `bg` / `surface` | 4,8 / 5,5 | 6,4 / 5,5 |
| `cyan-ink` sobre `bg` | 5,8 | 9,0 |
| `lime-ink` / `gold-ink` sobre `bg` | 5,1 / 5,2 | 9,4 / 8,6 |
| `danger-ink` sobre `bg` | 5,7 | 7,0 |
| `on-ink` sobre `ink` (botón primario) | 14,6 | 14,6 |
| `on-accent` sobre `gold` (hover, relleno) | 8,6 | 8,6 |
| Borde de control `line-strong` sobre `bg` | **2,4** | 3,7 |
| Borde decorativo `line` sobre `bg` | 1,3 | 1,6 |

### Puntos abiertos (no resueltos)

1. **Anillo de foco en el tema claro:** `ring` sigue siendo `cyan` (#57CAFF), que sobre `bg` claro da **1,6:1** y sobre `surface` blanca 1,9:1, por debajo del 3:1 que pide WCAG para indicadores de foco. En oscuro da 9,0:1.
2. **Borde de los campos de texto en claro:** `line-strong` da **2,4:1**, por debajo del 3:1 para componentes de interfaz. Los botones y cards no tienen el problema porque usan `ink`.
3. **Pixel art sobre fondo claro:** los sprites (planetas, medallas, avatar) se dibujaron para fondos oscuros; no se revisaron sobre el tema claro.
4. **Escenario (proyector):** no fuerza el tema oscuro; usa el que tenga el navegador que lo abre. Conviene fijarlo.
5. **Secciones antiguas de este documento:** el diagrama de componentes y los tokens de más abajo describen el look anterior; la tabla de arriba manda donde choquen.

## La regla 70 / 30

- **70% UI moderna.** Tipografía, botones, cards, navegación, pestañas, barras de progreso, textos y layout se ven como un producto actual: limpios, legibles y táctiles.
- **30% pixel art 16-bit.** Avatar, nave, planetas, medallas, enemigo, moneda, estrella y algún detalle decorativo.

El pixel art es el lenguaje de la temática, no el de la interfaz. Nunca van en pixel los párrafos, los títulos, los botones ni los marcos de las cards.

## Voz y contenido

- El usuario es un **cadete**; los puntos son **XP Estelar**; la moneda son **Créditos de Galaxia**; cada tecnología es un **planeta** (Google Cloud, Firebase, Android, AI, Comunidad GDG); las charlas, workshops y retos son **misiones**; escanear un QR es un **salto hiperespacial**.
- Rangos: **Recluta** (0 XP) → **Piloto** (100) → **Comandante** (500) → **Leyenda Estelar** (2000).
- Botones con verbo y en frase normal: "Escanear QR", "Ver mapa", "Reclamar recompensa". Nada de mayúsculas sostenidas.
- Descripciones de una línea: "Explora las posibilidades de la nube".
- El mini-juego premia y no castiga: si ganas, **XP x2**; si pierdes, conservas el XP base.

## Fundamentos visuales

**Fondo.** `bg` (azul espacial) con un degradado suave hacia `bg-violet`, dos nebulosas muy tenues y pocas estrellas pixel. Sin sobrecargar: el fondo acompaña, no compite.

**Cards.** Fondo `surface`, borde `line` de 1px, radio `radius-lg` y `shadow-card`. El brillo (`glow-cyan`, `glow-magenta`, `glow-gold`) se usa en un solo elemento por pantalla. Los paneles sobre escenas (salto, barra de navegación) son translúcidos con desenfoque.

**Color.** Los acentos se usan con moderación; el 90% de la pantalla es fondo, superficie y texto.

| Token | Hex | Uso |
|---|---|---|
| `cyan` | #22D3EE | Acento principal: botón primario, pestaña activa, progreso, mirilla |
| `violet` | #8B5CF6 | Acento secundario: degradados, nebulosas, medallas legendarias |
| `magenta` | #E879F9 | Momentos especiales: Desafío Especial, mini-juego, Lógica Obsoleta |
| `lime` | #A3E635 | Éxito: misión hecha, logro desbloqueado |
| `gold` | #FBBF24 | XP Estelar, Créditos de Galaxia, recompensas |

Los colores GDG (azul, rojo, amarillo, verde) viven dentro del pixel art de los planetas, no en la interfaz.

**Contraste.** `text` ≥ 14:1, `text-muted` ≥ 8:1 y `text-subtle` ≥ 5,6:1 sobre cualquier fondo o superficie. Los acentos como texto superan 6:1. Sobre rellenos cian, dorado o magenta el texto es `on-accent` (≥ 7:1).

**Tipografía.** **Space Grotesk** para títulos y cifras, **Inter** para todo lo demás. **Tiny5** (pixel) solo en etiquetas de juego: "+100 XP", "XP x2", "NV 3" y un mensaje grande por pantalla como máximo.

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=Tiny5&display=swap" rel="stylesheet">
```

**Iconos.** De línea, modernos, para la interfaz (`Icon`). El pixel art no se usa como icono de interfaz.

**Arte pixel.** Sprites nítidos a escala entera (16px → 32, 48 o 64px) dentro de casillas oscuras `.sa-art`. Los logos oficiales (DevFest, GDG, Google Cloud, Firebase, Android) no se redibujan: los planetas usan sus colores, y donde haga falta el logo real se usa el archivo del kit de marca.

## Movimiento (Framer Motion)

Animaciones cortas y suaves, con feedback después de cada acción.

- **Presionar:** `whileTap={{ scale: 0.97 }}`, 120ms.
- **Entrada de pantalla:** `y: 10 → 0` y opacidad, 280ms con curva `[0.2, 0.8, 0.2, 1]`.
- **Progreso:** el ancho se anima 600ms al ganar XP.
- **Escáner:** línea cian que sube y baja.
- **Salto hiperespacial:** estelas que nacen del planeta de destino, partículas, la nave flotando y el planeta acercándose.
- **Recompensa:** aviso superior con la estrella pixel y el XP ganado.
- Todo se reduce con `useReducedMotion()` / `prefers-reduced-motion`.

## Pantallas

1. **Inicio de Misión** (`DashboardView`): marca, card del cadete (rango, "750 / 2000 XP", XP y créditos), botón "Escanear QR" y misiones con el Desafío Especial.
2. **Salto Hiperespacial** (`ScannerView`): cámara con QR visible → salto animado → llegada → mini-juego opcional → recompensa.
3. **Mis Logros** (`AchievementsView`): resumen de la colección, filtros y medallas pixel en cards modernas.

`ArcadeApp` las une con la navegación (Inicio, Misiones, Logros, Mapa).

## Responsive

Móvil primero: una columna de hasta 520px, áreas táctiles de al menos 48px y navegación inferior. Desde 760px la navegación pasa a un riel lateral, el dashboard se abre en dos columnas y las medallas en cuatro.


---

# Tokens

## Color

| Token | Valor | Uso |
|---|---|---|
| `bg-deep` | #050816 | Fondo más profundo: barra de navegación, cámara, escena del salto. |
| `bg` | #0a0f24 | Fondo de la app. Lleva un degradado sutil hacia bg-violet y estrellas pixel dispersas. |
| `bg-violet` | #150f38 | Extremo violeta oscuro del degradado de fondo y de las nebulosas. |
| `surface` | #111833 | Cards y paneles. Texto text, text-muted o text-subtle encima. |
| `surface-raised` | #18214a | Card presionada o en hover, chips, pista de controles. |
| `line` | #232c57 | Borde de 1px de cards y separadores. |
| `line-strong` | #5b6ab8 | Borde de controles (chips, botón secundario) y de cards en hover. |
| `text` | #f4f6ff | Texto principal y títulos sobre bg y surface. |
| `text-muted` | #b4bde0 | Descripciones y texto secundario sobre bg y surface. |
| `text-subtle` | #8f9ac4 | Metadatos, etiquetas y pestañas inactivas (≥ 5:1 sobre surface). |
| `on-accent` | #04121a | Texto e iconos sobre rellenos cyan, lime y gold. |
| `cyan` | #22d3ee | Acento principal: botón primario, pestaña activa, progreso, mirilla, foco. Como texto sobre bg y surface. |
| `violet` | #8b5cf6 | Acento secundario: degradado del progreso, nebulosas, medallas legendarias. Relleno o borde; como texto usa violet-soft. |
| `violet-soft` | #b9a3ff | Texto violeta sobre bg y surface (rango, enlaces secundarios). |
| `magenta` | #e879f9 | Momentos especiales: Desafío Especial, mini-juego, enemigo "Lógica Obsoleta". Con moderación. |
| `lime` | #a3e635 | Éxito: misión completada, logro desbloqueado, XP x2. |
| `gold` | #fbbf24 | XP Estelar, Créditos de Galaxia, recompensas y medallas de oro. |
| `danger` | #fb7185 | Errores y tiempo agotado. |

## Tipografía

- `font-display`: "Space Grotesk", system-ui, sans-serif
- `font-body`: "Inter", system-ui, sans-serif
- `font-pixel`: "Tiny5", ui-monospace, monospace

### Títulos — Space Grotesk

| Estilo | Tamaño / interlínea | Peso | Ejemplo | Uso |
|---|---|---|---|---|
| `title-xl` | 26px / 30px | 700 | DevFest Space Arcade | Marca y título de pantalla. |
| `title` | 20px / 26px | 600 | Salto Hiperespacial | Títulos de barra superior y de sección destacada. |
| `heading` | 16px / 22px | 600 | Misiones disponibles | Título de card, nombre de misión y de medalla. |
| `stat` | 28px / 32px | 700 | 750 | Cifras grandes (XP, créditos). |

### Texto — Inter

| Estilo | Tamaño / interlínea | Peso | Ejemplo | Uso |
|---|---|---|---|---|
| `body` | 15px / 22px | 400 | Apunta la cámara al código QR del evento para iniciar el salto. | Texto corrido. |
| `body-sm` | 13px / 18px | 400 | Explora las posibilidades de la nube | Descripciones de misiones y medallas (text-muted). |
| `label` | 14px / 20px | 600 | Escanear QR | Botones y chips. |
| `caption` | 12px / 16px | 500 | 750 / 2000 XP | Metadatos, pestañas de navegación, contadores. |

### Acento pixel — Tiny5

| Estilo | Tamaño / interlínea | Peso | Ejemplo | Uso |
|---|---|---|---|---|
| `pixel-tag` | 16px / 16px | 400 | +100 XP | Solo detalles de videojuego: "+100 XP", "XP x2", "NV 3". A 16px (múltiplo de 8) se ve nítido. Nunca títulos, botones ni párrafos. |
| `pixel-callout` | 32px / 32px | 400 | LEVEL UP! | Un mensaje de juego por pantalla como máximo (recompensa, XP x2). |

## Espaciado

| Token | Valor | Uso |
|---|---|---|
| `space-1` | `4px` | Hueco entre icono y texto en chips. |
| `space-2` | `8px` | Hueco entre elementos de una fila. |
| `space-3` | `12px` | Hueco entre cards de una lista; padding de chips. |
| `space-4` | `16px` | Padding de cards y margen lateral en móvil. |
| `space-5` | `20px` | Padding de cards grandes. |
| `space-6` | `24px` | Separación entre secciones; margen lateral en tablet. |
| `space-8` | `32px` | Aire sobre títulos de pantalla en desktop. |

## Radios

| Token | Valor | Uso |
|---|---|---|
| `radius-sm` | `10px` | Chips de XP, casillas de arte pixel, celdas del mini-juego. |
| `radius-md` | `14px` | Botones, cards de misión, controles. |
| `radius-lg` | `20px` | Cards principales, cámara y escena del salto. |
| `radius-pill` | `999px` | Chips de filtro, rango y barras de progreso. |

## Sombras y brillos

| Token | Valor | Uso |
|---|---|---|
| `shadow-card` | `0 8px 24px rgba(3,6,20,0.45)` | Elevación de cards y de la barra de navegación. |
| `glow-cyan` | `0 0 0 1px rgba(34,211,238,0.55), 0 0 24px rgba(34,211,238,0.18)` | Elemento activo o enfocado: mirilla, card seleccionada. Uno por pantalla. |
| `glow-magenta` | `0 0 0 1px rgba(232,121,249,0.5), 0 0 24px rgba(232,121,249,0.16)` | Desafío Especial y mini-juego. |
| `glow-gold` | `0 0 0 1px rgba(251,191,36,0.55), 0 0 24px rgba(251,191,36,0.18)` | Recompensa reclamable y medalla recién desbloqueada. |

## Variables CSS

```css
:root {
  --bg-deep: #050816;
  --bg: #0a0f24;
  --bg-violet: #150f38;
  --surface: #111833;
  --surface-raised: #18214a;
  --line: #232c57;
  --line-strong: #5b6ab8;
  --text: #f4f6ff;
  --text-muted: #b4bde0;
  --text-subtle: #8f9ac4;
  --on-accent: #04121a;
  --cyan: #22d3ee;
  --violet: #8b5cf6;
  --violet-soft: #b9a3ff;
  --magenta: #e879f9;
  --lime: #a3e635;
  --gold: #fbbf24;
  --danger: #fb7185;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 20px;
  --radius-pill: 999px;
  --shadow-card: 0 8px 24px rgba(3,6,20,0.45);
  --glow-cyan: 0 0 0 1px rgba(34,211,238,0.55), 0 0 24px rgba(34,211,238,0.18);
  --glow-magenta: 0 0 0 1px rgba(232,121,249,0.5), 0 0 24px rgba(232,121,249,0.16);
  --glow-gold: 0 0 0 1px rgba(251,191,36,0.55), 0 0 24px rgba(251,191,36,0.18);
  --font-display: "Space Grotesk", system-ui, sans-serif;
  --font-body: "Inter", system-ui, sans-serif;
  --font-pixel: "Tiny5", ui-monospace, monospace;
}
```

---

# Componentes

Implementación de referencia en `window.SpaceArcade` (React 18). Las props vienen de `components/index.d.ts`.

## Arte pixel

### PixelArt

El arte pixel 16-bit del sistema: es el lenguaje de la temática y ocupa cerca del 30% de la interfaz.

- **Cadete** (`PixelAvatar`, 16×16): el nombre elige pelo, piel y traje, así que cada usuario tiene siempre el mismo avatar.
- **Nave** (`PixelShip`, 24×11): la GDG Tacna Enterprise; aparece en el salto hiperespacial.
- **Planetas** (`PixelPlanet`, 16×16): `cloud`, `firebase`, `android`, `ai`, `gdg` y `charla` (con anillo). Esferas sombreadas con bandas en los colores de cada tecnología.
- **Lógica Obsoleta** (`PixelEnemy`), **Crédito de Galaxia** (`PixelCoin`) y **estrella de XP** (`PixelStar`).
- Se muestra siempre a escala entera (16px → 32, 48 o 64px) dentro de una casilla `.sa-art`, con `shape-rendering: crispEdges`. Nunca se usa para texto, botones ni marcos.

### Medal

Medalla pixel de 24×20: forma (`shield`, `hex`, `round`) con contorno, aro, brillo, sombra e icono de 8×8.

- `tone`: `cyan`, `blue`, `violet`, `magenta`, `gold`, `lime`, `red`. `frame="gold"` pone el aro dorado.
- `decor`: `wings` (rangos) o `laurel` (logros de colección).
- `icon`: star, trophy, rocket, flame, gamepad, chevrons, helmet, planet, lock.
- Tamaño recomendado 84×70px (3,5×). La UI que la contiene es una card moderna, no un marco pixelado.

```ts
export interface MedalProps { shape?: 'shield' | 'hex' | 'round'; tone?: MedalTone; frame?: 'gold'; decor?: 'wings' | 'laurel'; icon?: MedalGlyph; title?: string }
```

## Fundamentos

### Icon

Iconos de línea modernos (trazo de 1,8px, extremos redondos) para toda la interfaz: navegación, botones y estados.

- Nombres: home, missions, trophy, map, scan, settings, chevron, back, check, lock, bolt, gamepad, gift, close, pin.
- Heredan `currentColor`. 22px por defecto, 20px dentro de botones.
- Los iconos de interfaz son siempre de línea; el pixel art queda para personajes, planetas y medallas.

```ts
export interface IconProps { name: IconName; size?: number; title?: string; className?: string }
```

## Controles

### Button

Botón moderno y táctil: 48px de alto, radio `radius-md`, texto Inter 600 en frase normal.

- `variant`: `primary` (cian, una acción principal por pantalla), `secondary` (contorno), `ghost` (texto), `gold` (reclamar recompensa), `magenta` (mini-juego).
- `size`: `sm` (36px), `md` (48px), `lg` (56px). `block` ocupa el ancho. `icon` e `iconRight` aceptan nombres de `Icon`.
- Al presionar escala a 0,97. Texto `on-accent` sobre los rellenos de color (≥ 7:1).
- Etiquetas con verbo: "Escanear QR", "Ver mapa", "Reclamar recompensa".

```ts
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'secondary' | 'ghost' | 'gold' | 'magenta'; size?: 'sm' | 'md' | 'lg'; block?: boolean; icon?: IconName; iconRight?: IconName }
```

### FilterChips

Chips de filtro en fila con scroll horizontal; el activo va relleno en cian.

- `tabs` (`[{ id, label }]`), `value`, `onChange`.

```ts
export interface FilterChipsProps { tabs: { id: string; label: string }[]; value: string; onChange?: (id: string) => void; label?: string }
```

## Contenedores

### Card

Contenedor base: fondo `surface` con un leve brillo superior, borde `line` de 1px, radio `radius-lg` y `shadow-card`.

- `tone`: `cyan` (elemento activo), `special` (degradado magenta, Desafío Especial y mini-juego), `gold` (recompensa). Un solo brillo por pantalla.
- `pad={false}` quita el padding para layouts propios.

```ts
export interface CardProps { tone?: 'cyan' | 'special' | 'gold'; pad?: boolean; as?: keyof JSX.IntrinsicElements; className?: string; style?: React.CSSProperties; children?: React.ReactNode }
```

## Gamificación

### XpTag

Etiqueta de recompensa en tipografía pixel: el único lugar donde aparece la fuente Tiny5.

- "+100 XP" (oro), "+250 XP" o "XP x2" (`tone="magenta"`), "Hecha" (`tone="lime"`), "Nivel 3" (`tone="cyan"`).
- Siempre a 16px para que los píxeles queden nítidos. `.sa-px-callout` (32px) se reserva a un mensaje de juego por pantalla.

```ts
export interface XpTagProps { tone?: 'gold' | 'magenta' | 'lime' | 'cyan'; children?: React.ReactNode }
```

### RankChip

Chip de rango: nivel en tipografía pixel ("NV 3") y nombre en Inter.

- Rangos: Recluta (0 XP), Piloto (100), Comandante (500), Leyenda Estelar (2000).
- `rank` o `xp` (calcula el rango).

```ts
export interface RankChipProps { rank?: Rank; xp?: number }
```

### ProgressBar

Barra de progreso moderna: pista `surface-raised`, relleno en degradado violeta → cian, transición suave.

- `value`, `max`, `label`, `valueText`, `tone` (`gold`, `lime`), `thin` (4px).
- Expone `role="progressbar"`.

```ts
export interface ProgressBarProps { value: number; max?: number; label?: string; valueText?: string; tone?: 'gold' | 'lime'; thin?: boolean }
```

### PlayerCard

Card del cadete: avatar pixel, nave, nombre, rango, progreso hacia el siguiente rango y dos cifras (XP Estelar y Créditos de Galaxia).

- `name`, `xp`, `credits`, `ship` ("GDG Tacna Enterprise"). `children` va al pie (el botón "Escanear QR").
- La información clave se lee de un vistazo: nombre, rango y "750 / 2000 XP".

```ts
export interface PlayerCardProps { name: string; xp: number; credits?: number; ship?: string; children?: React.ReactNode }
```

## Navegación

### BrandHeader

Cabecera del dashboard: planeta pixel de la comunidad como marca, "DevFest Space Arcade" en Space Grotesk, "Odisea de Código" y accesos a escanear y ajustes.

- `onScan`, `onSettings`. El logo oficial de DevFest o GDG, si se usa, sale del kit de marca del evento.

```ts
export interface BrandHeaderProps { onScan?: () => void; onSettings?: () => void }
```

### TopBar

Barra superior de pantallas internas: volver, título centrado en Space Grotesk y un hueco para una acción.

- `title`, `onBack`, `right`.

```ts
export interface TopBarProps { title: string; onBack?: () => void; right?: React.ReactNode }
```

### BottomNav

Navegación inferior moderna: barra translúcida con iconos de línea y etiquetas (Inicio, Misiones, Logros, Mapa).

- La pestaña activa va en cian con tres píxeles debajo, el único detalle pixel de la barra.
- Desde 760px de ancho se convierte en un riel lateral.
- `items`, `active`, `onChange(id)`. Respeta `safe-area-inset-bottom`.

```ts
export interface BottomNavProps { items?: NavItem[]; active: string; onChange?: (id: string) => void }
```

## Misiones

### MissionCard

Card de misión: planeta pixel, título, descripción de una línea, etiqueta de XP y flecha.

- `planet`: `cloud`, `firebase`, `android`, `ai`, `gdg`, `charla`.
- `status`: `available`, `done` (etiqueta "Hecha" y check) o `locked`.
- `special` la convierte en el Desafío Especial: degradado magenta, brillo y estrella pixel. Una por lista.
- Toda la card es el área táctil (mínimo 64px de alto).

```ts
export interface MissionCardProps { title: string; desc: string; planet?: PlanetKind; xp: number; special?: boolean; status?: 'available' | 'done' | 'locked'; onClick?: () => void }
```

## Salto hiperespacial

### QrScanner

Visor de cámara moderno: fondo oscuro con retícula tenue, cuatro esquinas cian, estado en una píldora y un QR de muestra bien visible.

- `state`: `idle` ("Cámara lista"), `scanning` (línea de barrido y "Leyendo código…"), `success` (esquinas lima).
- Pasa el `<video>` como `children` y `hideSample` para ocultar el QR de muestra. La lectura real (BarcodeDetector o `@zxing/browser`) la aporta la app.

```ts
export interface QrScannerProps { state?: 'idle' | 'scanning' | 'success'; hideSample?: boolean; children?: React.ReactNode }
```

### HyperJump

Escena del salto: túnel de estelas animadas hacia el planeta de destino, partículas, nave pixel y un panel translúcido con el texto.

- `state`: `jumping` (estelas, progreso y "Iniciando salto hiperespacial…") o `arrived` (escena en calma). `progress` acerca el planeta.
- `planet`, `destination`. `children` reemplaza el contenido del panel (resultado y botones).

```ts
export interface HyperJumpProps { state?: 'jumping' | 'arrived'; progress?: number; planet?: PlanetKind; destination?: string; children?: React.ReactNode }
```

### MiniGame

Mini-juego rápido tras el salto: toca al bug de la Lógica Obsoleta antes de que acabe el tiempo. Si ganas, la recompensa se duplica (XP x2).

- `goal` (5 aciertos), `seconds` (8), `onFinish(won)`.
- Si se pierde, el XP base se conserva: el mini-juego nunca castiga.

```ts
export interface MiniGameProps { goal?: number; seconds?: number; onFinish?: (won: boolean) => void }
```

## Logros

### AchievementCard

Card de logro: medalla pixel, nombre, descripción y estado.

- Desbloqueada: check lima y "Desbloqueada". Bloqueada: medalla en gris con candado y barra de progreso (`progress: { cur, max }`).
- `isNew` añade el brillo dorado al logro recién conseguido.

```ts
export interface AchievementCardProps { name: string; desc: string; medal: MedalProps; unlocked?: boolean; progress?: { cur: number; max: number }; isNew?: boolean; onClick?: () => void }
```

## Pantallas

### DashboardView

Pantalla 1, Inicio de Misión: marca, card del cadete con "Escanear QR" y lista de misiones con el Desafío Especial.

- Props: `name`, `xp`, `credits`, `done`, `onMission(m)`, `onScan`.
- En tablet y escritorio pasa a dos columnas: cadete a la izquierda, misiones a la derecha.

```ts
export interface DashboardViewProps { name?: string; xp?: number; credits?: number; done?: Record<string, boolean>; missions?: Mission[]; special?: Mission; onMission?: (m: Mission) => void; onScan?: () => void }
```

### ScannerView

Pantalla 2, Salto Hiperespacial. Etapas: escanear → salto animado → llegada → mini-juego opcional → recompensa.

- Props: `xp`, `planet`, `destination`, `onComplete(xpGanado, ganoJuego)`, `onBack`.

```ts
export interface ScannerViewProps { xp?: number; planet?: PlanetKind; destination?: string; onComplete?: (xpGained: number, wonGame: boolean) => void; onBack?: () => void; initialStage?: 'scan' | 'jump' }
```

### AchievementsView

Pantalla 3, Mis Logros: resumen de la colección con barra dorada, filtros y cuadrícula de medallas (2 columnas en móvil, 4 en escritorio).

- `achievements`: `[{ id, name, desc, unlocked, progress, medal }]`.

```ts
export interface AchievementsViewProps { achievements?: Achievement[]; xp?: number; onBack?: () => void }
```

### ArcadeApp

La PWA completa: fondo espacial, pantallas, aviso de recompensa y navegación.

- Tocar una misión abre el salto hacia su planeta; al reclamar se suma el XP, 10 Créditos de Galaxia y la misión queda hecha.
- Pestañas: Inicio, Misiones, Logros y Mapa (los cinco planetas de la nave).

```ts
export interface ArcadeAppProps { initialView?: 'dashboard' | 'missions' | 'achievements' | 'map' | 'scanner'; xp?: number; name?: string; height?: string }
```

---

# Tipos completos

```ts
import type * as React from 'react';

export type IconName = 'home' | 'missions' | 'trophy' | 'map' | 'scan' | 'settings' | 'chevron' | 'back' | 'check' | 'lock' | 'bolt' | 'gamepad' | 'gift' | 'close' | 'pin';
export type PlanetKind = 'cloud' | 'firebase' | 'android' | 'ai' | 'gdg' | 'charla';
export type MedalTone = 'cyan' | 'blue' | 'violet' | 'magenta' | 'gold' | 'lime' | 'red';
export type MedalGlyph = 'star' | 'trophy' | 'rocket' | 'flame' | 'gamepad' | 'chevrons' | 'helmet' | 'planet' | 'lock';

export declare function PixelArt(): React.ReactElement;
export declare function PixelAvatar(props: { seed?: string; title?: string }): React.ReactElement;
export declare function PixelShip(props: { className?: string; style?: React.CSSProperties }): React.ReactElement;
export declare function PixelPlanet(props: { kind?: PlanetKind; title?: string; className?: string }): React.ReactElement;
export declare function PixelEnemy(props: { className?: string }): React.ReactElement;
export declare function PixelCoin(props: { className?: string }): React.ReactElement;
export declare function PixelStar(props: { className?: string }): React.ReactElement;

export interface MedalProps { shape?: 'shield' | 'hex' | 'round'; tone?: MedalTone; frame?: 'gold'; decor?: 'wings' | 'laurel'; icon?: MedalGlyph; title?: string }
export declare function Medal(props: MedalProps): React.ReactElement;

export interface IconProps { name: IconName; size?: number; title?: string; className?: string }
export declare function Icon(props: IconProps): React.ReactElement;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'secondary' | 'ghost' | 'gold' | 'magenta'; size?: 'sm' | 'md' | 'lg'; block?: boolean; icon?: IconName; iconRight?: IconName }
export declare function Button(props: ButtonProps): React.ReactElement;

export interface CardProps { tone?: 'cyan' | 'special' | 'gold'; pad?: boolean; as?: keyof JSX.IntrinsicElements; className?: string; style?: React.CSSProperties; children?: React.ReactNode }
export declare function Card(props: CardProps): React.ReactElement;

export interface XpTagProps { tone?: 'gold' | 'magenta' | 'lime' | 'cyan'; children?: React.ReactNode }
export declare function XpTag(props: XpTagProps): React.ReactElement;

export interface Rank { level: 1 | 2 | 3 | 4; name: 'Recluta' | 'Piloto' | 'Comandante' | 'Leyenda Estelar'; minXp: number }
export interface RankChipProps { rank?: Rank; xp?: number }
export declare function RankChip(props: RankChipProps): React.ReactElement;

export interface ProgressBarProps { value: number; max?: number; label?: string; valueText?: string; tone?: 'gold' | 'lime'; thin?: boolean }
export declare function ProgressBar(props: ProgressBarProps): React.ReactElement;

export interface BrandHeaderProps { onScan?: () => void; onSettings?: () => void }
export declare function BrandHeader(props: BrandHeaderProps): React.ReactElement;

export interface TopBarProps { title: string; onBack?: () => void; right?: React.ReactNode }
export declare function TopBar(props: TopBarProps): React.ReactElement;

export interface PlayerCardProps { name: string; xp: number; credits?: number; ship?: string; children?: React.ReactNode }
export declare function PlayerCard(props: PlayerCardProps): React.ReactElement;

export interface MissionCardProps { title: string; desc: string; planet?: PlanetKind; xp: number; special?: boolean; status?: 'available' | 'done' | 'locked'; onClick?: () => void }
export declare function MissionCard(props: MissionCardProps): React.ReactElement;

export interface FilterChipsProps { tabs: { id: string; label: string }[]; value: string; onChange?: (id: string) => void; label?: string }
export declare function FilterChips(props: FilterChipsProps): React.ReactElement;

export interface QrScannerProps { state?: 'idle' | 'scanning' | 'success'; hideSample?: boolean; children?: React.ReactNode }
export declare function QrScanner(props: QrScannerProps): React.ReactElement;

export interface HyperJumpProps { state?: 'jumping' | 'arrived'; progress?: number; planet?: PlanetKind; destination?: string; children?: React.ReactNode }
export declare function HyperJump(props: HyperJumpProps): React.ReactElement;

export interface AchievementCardProps { name: string; desc: string; medal: MedalProps; unlocked?: boolean; progress?: { cur: number; max: number }; isNew?: boolean; onClick?: () => void }
export declare function AchievementCard(props: AchievementCardProps): React.ReactElement;

export interface MiniGameProps { goal?: number; seconds?: number; onFinish?: (won: boolean) => void }
export declare function MiniGame(props: MiniGameProps): React.ReactElement;

export interface NavItem { id: string; label: string; icon: IconName }
export interface BottomNavProps { items?: NavItem[]; active: string; onChange?: (id: string) => void }
export declare function BottomNav(props: BottomNavProps): React.ReactElement;

export interface Mission { id: string; title: string; desc: string; planet: PlanetKind; xp: number; special?: boolean }
export interface DashboardViewProps { name?: string; xp?: number; credits?: number; done?: Record<string, boolean>; missions?: Mission[]; special?: Mission; onMission?: (m: Mission) => void; onScan?: () => void }
export declare function DashboardView(props: DashboardViewProps): React.ReactElement;

export interface ScannerViewProps { xp?: number; planet?: PlanetKind; destination?: string; onComplete?: (xpGained: number, wonGame: boolean) => void; onBack?: () => void; initialStage?: 'scan' | 'jump' }
export declare function ScannerView(props: ScannerViewProps): React.ReactElement;

export interface Achievement { id: string; name: string; desc: string; medal: MedalProps; unlocked?: boolean; progress?: { cur: number; max: number }; isNew?: boolean }
export interface AchievementsViewProps { achievements?: Achievement[]; xp?: number; onBack?: () => void }
export declare function AchievementsView(props: AchievementsViewProps): React.ReactElement;

export interface ArcadeAppProps { initialView?: 'dashboard' | 'missions' | 'achievements' | 'map' | 'scanner'; xp?: number; name?: string; height?: string }
export declare function ArcadeApp(props: ArcadeAppProps): React.ReactElement;

declare global { interface Window { SpaceArcade: {
  PixelArt: typeof PixelArt; Medal: typeof Medal; Icon: typeof Icon; Button: typeof Button; Card: typeof Card; XpTag: typeof XpTag; RankChip: typeof RankChip; ProgressBar: typeof ProgressBar;
  BrandHeader: typeof BrandHeader; TopBar: typeof TopBar; PlayerCard: typeof PlayerCard; MissionCard: typeof MissionCard; FilterChips: typeof FilterChips; QrScanner: typeof QrScanner; HyperJump: typeof HyperJump;
  AchievementCard: typeof AchievementCard; MiniGame: typeof MiniGame; BottomNav: typeof BottomNav; DashboardView: typeof DashboardView; ScannerView: typeof ScannerView; AchievementsView: typeof AchievementsView; ArcadeApp: typeof ArcadeApp;
  RANKS: Rank[]; rankFor(xp: number): Rank; nextRank(xp: number): Rank | null;
} } }
```