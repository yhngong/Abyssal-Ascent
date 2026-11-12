# ABYSSAL ASCENT — 12,000m 3D Deep-Sea Survival Game

A 3D first-person deep-sea bathyscaphe survival game built with **Three.js**, **TypeScript**, **Vite**, and procedural **Web Audio API** sound synthesis.

Your tether has snapped at **12,000 meters** at the bottom of the Hadal Trench. Choose your difficulty, take the pilot seat of the **NEREUS-VII**, and slowly ascend back to **0m** while fighting off abyssal monsters, managing your acoustic motor & floodlight signatures, and running through the 3D submarine cabin to repair breached parts before they rupture open and drown you.

---

## Key Features

- **12,000m to 0m Dynamic Ocean Ascent**: Ascend through 5 ocean zones (*Hadal Trench → Abyssal Plain → Midnight Zone → Twilight Zone → Sunlight Zone*) with dynamic fog, bioluminescent plankton, trench spires, and surface sunlight.
- **4 Pre-Game Difficulty Modes**:
  - **Explorer (Easy)** — Faster ascent, forgiving hull rupture timers, calmer fauna.
  - **Diver (Normal)** — Balanced tactical survival experience.
  - **Abyssal (Hard)** — Aggressive multi-species hunter packs and tight breach timers.
  - **Hadal Nightmare (Extreme)** — Relentless apex leviathans from 12,000m up.
- **Pilot Bridge Weapons & Stealth Systems**:
  - **Heavy Harpoon Cannon `[1]`**: Armor-piercing tethered harpoons with quiet pneumatic launch.
  - **Rotary 20mm Autocannon `[2]`**: Rapid-fire tracer drum great against fast swarms (loud acoustic signature!).
  - **Main Motor Toggle `[M]` & Overdrive `[Shift]`**: Turn the motor ON to ascend or cut it OFF for silent stealth drift.
  - **Floodlights `[F]` & Active Sonar Ping `[C]`**: Manage visibility vs. light-sensitive predators.
- **7 Unique 3D Monsters with Sensory Counterplay**:
  1. **Blind Trench Stalker**: Completely eyeless! Listens to motor and gunfire noise — cut your motor `[M]` and hold fire so it swims harmlessly past.
  2. **Photovore Angler-Ray**: Drawn to your ship's floodlights — turn Floodlights OFF `[F]` to make it lose lock and drift away.
  3. **Void Shadow Kraken**: Photophobic ambush predator that charges in darkness — shine Floodlights ON `[F]` to sear and slow it!
  4. **Crusher Leviathan**: Bulletproof chitin armor deflects bullets — pierce it with Heavy Harpoons `[1]`.
  5. **Razor Viper Swarm**: Erratic darting school — mow them down with Rotary Bullets `[2]`.
  6. **Volt EMP Siphonophore**: Bio-electric jellyfish that shocks the Electrical Grid and forces lights ON.
  7. **Mimic Lantern-Siren**: Disguises itself as a calm glowing lure until close, then unhinges its jaws and lunges.
- **Walkable 3D Submarine Cabin & 5 Emergency Repair Minigames**:
  - Leave the pilot chair (`[Space]` / `[Tab]`), run with `WASD` to sparking, leaking ship parts, and press `[E]` before the rupture timer hits `0.0s` and floods the cabin:
    - **Connect Wires** (*Electrical Grid*)
    - **Click Moving Leak Circles** (*Port & Starboard Hull Plating*)
    - **Spinning Timing Calibration Ring** (*Main Ascent Turbine*)
    - **Hydraulic Pressure Sliders** (*Ballast & O2 Valves*)
    - **Emergency Frequency Keypad** (*Sonar & Turret Relay*)

---

## Run Locally

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```
