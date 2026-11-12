import { MonsterInstance } from './monsters';
import { ShipPartState, STARTING_DEPTH } from './types';
import { WeaponSystem } from './weapons';

export class HUDManager {
  private hudRoot = document.getElementById('hud') as HTMLDivElement;
  private zoneNameEl = document.getElementById('hud-zone-name') as HTMLElement;
  private ascentRateEl = document.getElementById('hud-ascent-rate') as HTMLElement;
  private depthValueEl = document.getElementById('hud-depth-value') as HTMLElement;
  private depthFillEl = document.getElementById('hud-depth-fill') as HTMLDivElement;

  private floodPctEl = document.getElementById('hud-flood-pct') as HTMLElement;
  private oxygenFillEl = document.getElementById('hud-oxygen-fill') as HTMLDivElement;
  private floodFillEl = document.getElementById('hud-flood-fill') as HTMLDivElement;

  private alertBannerEl = document.getElementById('hud-alert-banner') as HTMLDivElement;
  private partsListEl = document.getElementById('hud-parts-list') as HTMLDivElement;

  private modePillEl = document.getElementById('hud-mode-pill') as HTMLDivElement;
  private sysMotorCard = document.getElementById('sys-motor') as HTMLDivElement;
  private sysMotorState = document.getElementById('sys-motor-state') as HTMLDivElement;
  private sysLightsCard = document.getElementById('sys-lights') as HTMLDivElement;
  private sysLightsState = document.getElementById('sys-lights-state') as HTMLDivElement;
  private sysSonarCard = document.getElementById('sys-sonar') as HTMLDivElement;
  private sysSonarState = document.getElementById('sys-sonar-state') as HTMLDivElement;
  private noiseFillEl = document.getElementById('hud-noise-fill') as HTMLDivElement;

  private wpnHarpoonCard = document.getElementById('wpn-harpoon') as HTMLDivElement;
  private wpnHarpoonBar = document.getElementById('wpn-harpoon-bar') as HTMLDivElement;
  private wpnHarpoonTxt = document.getElementById('wpn-harpoon-txt') as HTMLDivElement;
  private wpnBulletsCard = document.getElementById('wpn-bullets') as HTMLDivElement;
  private wpnBulletsBar = document.getElementById('wpn-bullets-bar') as HTMLDivElement;
  private wpnBulletsTxt = document.getElementById('wpn-bullets-txt') as HTMLDivElement;

  private pilotReticle = document.getElementById('pilot-reticle') as HTMLDivElement;
  private walkReticle = document.getElementById('walk-reticle') as HTMLDivElement;
  private hitmarkerEl = document.getElementById('reticle-hitmarker') as HTMLDivElement;
  private promptEl = document.getElementById('interaction-prompt') as HTMLDivElement;
  private pointerHintEl = document.getElementById('pointer-lock-hint') as HTMLDivElement;

  private fxFlood = document.getElementById('fx-flood-overlay') as HTMLDivElement;
  private fxDamage = document.getElementById('fx-damage-flash') as HTMLDivElement;
  private fxDrown = document.getElementById('fx-drowning-vignette') as HTMLDivElement;

  private sonarCanvas = document.getElementById('sonar-canvas') as HTMLCanvasElement;
  private sonarCtx = this.sonarCanvas.getContext('2d')!;

  private hitmarkerTimer = 0;
  private alertTimer = 0;

  public show(visible: boolean): void {
    this.hudRoot.classList.toggle('hidden', !visible);
    if (!visible) {
      this.fxFlood.style.height = '0%';
      this.fxDamage.style.opacity = '0';
      this.fxDrown.style.opacity = '0';
    }
  }

  public showAlert(msg: string, duration = 3.2): void {
    this.alertBannerEl.textContent = msg;
    this.alertBannerEl.classList.remove('hidden');
    this.alertTimer = duration;
  }

  public flashHitmarker(ricochet = false): void {
    this.hitmarkerEl.style.borderColor = ricochet ? '#94a3b8' : '#f87171';
    this.hitmarkerEl.classList.remove('hidden');
    this.hitmarkerTimer = 0.14;
  }

  public flashHullDamage(): void {
    this.fxDamage.style.opacity = '0.9';
    setTimeout(() => {
      this.fxDamage.style.opacity = '0';
    }, 220);
  }

  public update(params: {
    dt: number;
    time: number;
    depth: number;
    zoneName: string;
    ascentRate: number;
    floodPercent: number;
    piloting: boolean;
    motorOn: boolean;
    overdrive: boolean;
    lightsOn: boolean;
    sonarCooldown: number;
    noiseLevel: number;
    weapons: WeaponSystem;
    parts: ShipPartState[];
    monsters: MonsterInstance[];
    sonarDamaged: boolean;
    promptText: string | null;
    pointerLocked: boolean;
    minigameOpen: boolean;
  }): void {
    const {
      dt,
      time,
      depth,
      zoneName,
      ascentRate,
      floodPercent,
      piloting,
      motorOn,
      overdrive,
      lightsOn,
      sonarCooldown,
      noiseLevel,
      weapons,
      parts,
      monsters,
      sonarDamaged,
      promptText,
      pointerLocked,
      minigameOpen,
    } = params;

    // Timers
    if (this.hitmarkerTimer > 0) {
      this.hitmarkerTimer -= dt;
      if (this.hitmarkerTimer <= 0) this.hitmarkerEl.classList.add('hidden');
    }
    if (this.alertTimer > 0) {
      this.alertTimer -= dt;
      if (this.alertTimer <= 0) this.alertBannerEl.classList.add('hidden');
    }

    // Depth & Ascent
    this.zoneNameEl.textContent = zoneName;
    this.depthValueEl.textContent = `${Math.max(0, Math.round(depth)).toLocaleString()}m`;
    const progress = ((STARTING_DEPTH - depth) / STARTING_DEPTH) * 100;
    this.depthFillEl.style.width = `${Math.min(100, Math.max(0, progress))}%`;

    if (motorOn) {
      this.ascentRateEl.textContent = `+${ascentRate.toFixed(1)} m/s${overdrive ? ' [OVERDRIVE]' : ''}`;
      this.ascentRateEl.style.color = overdrive ? '#fde047' : '#4ade80';
    } else {
      this.ascentRateEl.textContent = '0.0 m/s [STEALTH DRIFT]';
      this.ascentRateEl.style.color = '#94a3b8';
    }

    // Flooding & Oxygen
    const clampedFlood = Math.min(100, Math.max(0, floodPercent));
    this.floodPctEl.textContent = `${Math.round(clampedFlood)}% FLOODED`;
    this.floodFillEl.style.width = `${clampedFlood}%`;
    this.oxygenFillEl.style.width = `${100 - clampedFlood}%`;
    this.fxFlood.style.height = `${clampedFlood * 0.85}%`;
    this.fxDrown.style.opacity = clampedFlood > 55 ? String((clampedFlood - 55) / 45) : '0';

    // Mode & Reticles
    this.modePillEl.textContent = piloting
      ? 'MODE: PILOT BRIDGE [SPACE / TAB to Walk Cabin & Repair]'
      : 'MODE: CABIN WALK [WASD Move | E Interact | TAB Sit Pilot]';
    this.pilotReticle.classList.toggle('hidden', !piloting);
    this.walkReticle.classList.toggle('hidden', piloting);

    if (promptText && !minigameOpen) {
      this.promptEl.textContent = promptText;
      this.promptEl.classList.remove('hidden');
    } else {
      this.promptEl.classList.add('hidden');
    }

    this.pointerHintEl.classList.toggle('hidden', pointerLocked || minigameOpen);

    // Systems Cards
    this.sysMotorCard.className = `sys-card ${motorOn ? 'active' : 'off'}`;
    this.sysMotorState.textContent = motorOn ? (overdrive ? 'OVERDRIVE!' : 'RUNNING') : 'SILENT OFF';

    this.sysLightsCard.className = `sys-card ${lightsOn ? 'active' : 'off'}`;
    this.sysLightsState.textContent = lightsOn ? 'BEAMS ON' : 'DARKNESS';

    this.sysSonarCard.className = `sys-card ${sonarCooldown <= 0 ? 'active' : 'off'}`;
    this.sysSonarState.textContent = sonarCooldown <= 0 ? 'READY' : `${sonarCooldown.toFixed(1)}s`;

    this.noiseFillEl.style.width = `${Math.min(100, noiseLevel * 100)}%`;

    // Weapons
    this.wpnHarpoonCard.classList.toggle('selected', weapons.activeWeapon === 'harpoon');
    this.wpnBulletsCard.classList.toggle('selected', weapons.activeWeapon === 'bullets');

    const harpReadyPct =
      weapons.harpoonCooldown <= 0
        ? 100
        : (1 - weapons.harpoonCooldown / weapons.harpoonMaxCooldown) * 100;
    this.wpnHarpoonBar.style.width = `${Math.max(0, Math.min(100, harpReadyPct))}%`;
    this.wpnHarpoonTxt.textContent =
      weapons.harpoonCooldown <= 0 ? 'SPEAR LOADED' : `REELING ${weapons.harpoonCooldown.toFixed(1)}s`;

    if (weapons.bulletReloadTimer > 0) {
      const relPct = (1 - weapons.bulletReloadTimer / weapons.bulletReloadDuration) * 100;
      this.wpnBulletsBar.style.width = `${Math.max(0, Math.min(100, relPct))}%`;
      this.wpnBulletsTxt.textContent = `RELOADING ${weapons.bulletReloadTimer.toFixed(1)}s`;
    } else {
      this.wpnBulletsBar.style.width = `${(weapons.bulletAmmo / weapons.bulletMaxAmmo) * 100}%`;
      this.wpnBulletsTxt.textContent = `${weapons.bulletAmmo} / ${weapons.bulletMaxAmmo} [R]`;
    }

    // Ship Parts Integrity List
    this.partsListEl.innerHTML = parts
      .map((p) => {
        if (!p.damaged) {
          return `
            <div class="part-item">
              <div class="part-row">
                <span>${p.name}</span>
                <span class="part-status-ok">SEALED</span>
              </div>
              <div class="part-bar"><div class="part-bar-fill" style="width:100%"></div></div>
            </div>
          `;
        }
        const pct = Math.max(0, (p.timer / p.maxTimer) * 100);
        return `
          <div class="part-item damaged">
            <div class="part-row">
              <span>⚠ ${p.name}</span>
              <span class="part-status-dmg">RUPTURE ${p.timer.toFixed(1)}s</span>
            </div>
            <div class="part-bar"><div class="part-bar-fill" style="width:${pct}%"></div></div>
          </div>
        `;
      })
      .join('');

    // Render Hydrophone / Sonar Radar
    this.renderSonarRadar(time, monsters, sonarDamaged);
  }

  private renderSonarRadar(time: number, monsters: MonsterInstance[], sonarDamaged: boolean): void {
    const ctx = this.sonarCtx;
    const w = this.sonarCanvas.width;
    const h = this.sonarCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = cx - 6;

    ctx.clearRect(0, 0, w, h);

    // Circular radar background
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#03111f';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = sonarDamaged ? '#ef4444' : '#0ea5e9';
    ctx.stroke();

    if (sonarDamaged && Math.sin(time * 22) > 0) {
      // Radar static interference when Sonar Relay is damaged!
      ctx.fillStyle = 'rgba(248, 113, 113, 0.22)';
      for (let i = 0; i < 16; i++) {
        ctx.fillRect(14, Math.random() * h, w - 28, 3);
      }
      ctx.fillStyle = '#fca5a5';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('RELAY DAMAGED', cx, cy + 4);
      return;
    }

    // Range rings
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.lineWidth = 1;
    for (const frac of [0.35, 0.7]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * frac, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Forward FOV wedge
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - r * 0.72, cy - r * 0.68);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + r * 0.72, cy - r * 0.68);
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.28)';
    ctx.stroke();

    // Sweeping radar line
    const sweepAngle = (time * 2.2) % (Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweepAngle) * r, cy + Math.sin(sweepAngle) * r);
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Submarine center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();

    // Monster blips (X right, -Z up on radar)
    const maxRange = 98;
    for (const m of monsters) {
      const nx = (m.position.x / maxRange) * r;
      const ny = (m.position.z / maxRange) * r; // -Z is forward -> negative ny = top of radar!
      if (Math.hypot(nx, ny) > r - 4) continue;

      let color = '#f87171';
      if (m.type === 'photovore') color = '#facc15';
      else if (m.type === 'shadow_kraken') color = '#c084fc';
      else if (m.type === 'crusher') color = '#fb923c';
      else if (m.type === 'razor_swarm') color = '#4ade80';
      else if (m.type === 'volt_jelly') color = '#22d3ee';
      else if (m.type === 'mimic_siren') color = m.agitated ? '#f43f5e' : '#f9a8d4';

      ctx.beginPath();
      ctx.arc(cx + nx, cy + ny, m.agitated ? 4.2 : 3.0, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }
}
