# Mini-games plan (phase 5)

_Planned with the organizer on 2026-10-10. Player-facing names and copy are in Spanish; everything else in English._

## Rules that apply to every game

- **A bonus on a completed mission, not a mission type.** After completing a mission whose game is set and enabled, the attendee sees "Jugar por XP x2". **One attempt.** Winning grants the mission's earned XP again (XP only, no G-Credits). Losing keeps the base XP.
- **The phone decides the result** (chosen by the organizer). The server only issues a single-use play ticket and accepts one result per ticket. It refuses a result sent faster than the game's minimum time. A ticket that expires counts as lost.
- **Duration depends on the game**, never more than 90 s.
- **Difficulty is configurable** (easy / normal / hard). It is set per game and edition in the admin "Mini-juegos" screen, and a mission can override it for itself. Default: normal.
- **Controls:**
  - Action games use large on-screen buttons (48 px), like a handheld console, and the keyboard on a computer.
  - Puzzle games are played by tapping.
  - Nothing ever asks the attendee to type.
- **One shared frame** for all games:
  1. A short intro with how to play and "Comenzar".
  2. A 3-2-1 countdown.
  3. A HUD with time and lives.
  4. The result: "¡Ganaste! +40 XP", or "Fin del juego: conservas tus 40 XP".
- **If the tab is hidden the game pauses.** The ticket lasts the game's longest time plus 2 minutes, so a short interruption does not lose the attempt.
- **Look:**
  - Pixel art per the design system, with integer scales and crisp edges.
  - The game area is drawn with the design tokens.
  - Under reduced motion there is no screen shake and no flashes. The game itself still moves.
  - Information never depends on colour alone (shapes and labels too).
- **Tech:**
  - Each game is a client component loaded on demand, so it never weighs on the rest of the app.
  - Action games use a canvas with a small game loop of our own. Puzzle games use regular elements.
  - No game engine library.
  - Each game exposes `onFinish(won)` and nothing else crosses to the server.

## The five games built in phase 5

### 1. Bug Kong (platforms, inspired by Donkey Kong)
- **Story:** a giant pixel bug sits at the top of a space station and throws rolling "excepciones" down the ramps. Climb to the top and apply the patch.
- **Controls:** ← → to walk, ↑ ↓ on a ladder, a jump button.
- **Win:** reach the top. **Lose:** run out of lives or of time.

| | easy | normal | hard |
|---|---|---|---|
| Floors | 3 | 4 | 5 |
| Lives | 3 | 2 | 1 |
| Time limit | 75 s | 60 s | 50 s |
| Throws | slow | medium | fast, some fall down ladders |

- **Server minimum:** 15 s.

### 2. Invasores de bugs (shooter, inspired by Space Invaders)
- **Story:** rows of pixel bugs come down towards the station. The ship fires on its own; you move and dodge the "errores" they drop.
- **Controls:** ← → (auto-fire).
- **Win:** clear every bug. **Lose:** the bugs reach the bottom line, or you run out of lives or of time.

| | easy | normal | hard |
|---|---|---|---|
| Bug grid | 3 × 6 | 4 × 7 | 5 × 8 |
| Lives | 3 | 2 | 1 |
| Time limit | 60 s | 60 s | 50 s |

- **Server minimum:** 15 s.

### 3. Conecta los circuitos (puzzle)
- **Story:** the energy has to flow from the reactor to the core. Tap a piece to rotate it.
- **Board:** generated with at least one solution every time (a random path, then the pieces are shuffled by rotation).
- **Win:** the energy reaches the core. **Lose:** time runs out.

| | easy | normal | hard |
|---|---|---|---|
| Board | 4 × 4 | 5 × 5 | 6 × 6 |
| Time limit | 60 s | 50 s | 40 s |

- **Server minimum:** 8 s.

### 4. Ordena el código (code puzzle, no typing)
- **Story:** a short snippet comes out shuffled. Tap the lines in the right order to build the program. A tapped line moves to the program; a wrong one shakes and counts as a mistake.
- **Content:**
  - Fragments in **JavaScript / TypeScript** and **Python**, about Google tech (Firebase, Gemini, Angular, Cloud).
  - A bundled set of about 15 per language, picked at random.
  - The admin may hide one language for the edition.
- **Win:** 3 snippets put in order. **Lose:** too many mistakes, or time runs out.

| | easy | normal | hard |
|---|---|---|---|
| Lines per snippet | 4 | 5 | 6 |
| Mistakes allowed | 3 | 2 | 1 |
| Time limit | 60 s | 45 s | 35 s |

- **Server minimum:** 10 s.

### 5. Salto en el momento justo (timing)
- **Story:** a marker swings across the hyperspace bar. Tap while it is in the green zone to jump. Each jump speeds the marker up and narrows the zone.
- **Controls:** one big "Saltar" button (or the space bar).
- **Win:** enough jumps hit out of 5. **Lose:** too many misses.

| | easy | normal | hard |
|---|---|---|---|
| Hits needed | 3 of 5 | 4 of 5 | 5 of 5 |

- **Duration:** about 20 s.
- **Server minimum:** 6 s.

## Build order inside phase 5

1. **Platform (server):** catalog, per-edition settings with difficulty, play ticket and result, XP bonus.
2. **Shared frame, plus the first games:**
   - Salto en el momento justo, the simplest, which proves the whole flow end to end.
   - Conecta los circuitos.
   - Ordena el código.
3. **The action games:** Invasores de bugs and Bug Kong (canvas, on-screen controls).
4. **Admin "Mini-juegos"** (enable and difficulty per game) and the game and difficulty fields in the mission form.

## Chosen by the organizer, noted for later editions (not built now)

- **Esquiva meteoritos:** move the ship and survive a meteor shower that speeds up.
- **Tiro al asteroide:** tap the asteroids that cross the screen.
- **Recolector de estrellas:** catch stars and G-Coins, avoid space junk.
- **Secuencia de señales:** repeat a sequence of lights, like Simon.
- **Laberinto de agujero de gusano:** guide the ship through a short maze.
- **Aterrizaje lunar:** hold the thruster to land softly.
- **Nave entre asteroides:** tap to fly through the gaps, Flappy style.
- **Apila la estación:** stack moving modules into a 10-floor station.
- **Caza el bug:** tap the line with the error in a short snippet.
- **Teclea el comando:** pick the right words from buttons instead of the phone keyboard.
- **Trivia relámpago:** 5 yes/no questions against the clock, unlike the quiz mission type.
