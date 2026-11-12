import { SoundEngine } from './audio';
import { ShipPartState } from './types';

export class MinigameController {
  private overlay = document.getElementById('minigame-overlay') as HTMLDivElement;
  private titleEl = document.getElementById('mg-title') as HTMLHeadingElement;
  private instructionsEl = document.getElementById('mg-instructions') as HTMLParagraphElement;
  private stageEl = document.getElementById('mg-stage') as HTMLDivElement;
  private timerTextEl = document.getElementById('mg-timer-text') as HTMLElement;
  private ruptureFillEl = document.getElementById('mg-rupture-fill') as HTMLDivElement;
  private closeBtn = document.getElementById('mg-close-btn') as HTMLButtonElement;

  public activePart: ShipPartState | null = null;
  private rafId = 0;
  private cleanupFn: (() => void) | null = null;
  private onCompleteCallback: ((part: ShipPartState) => void) | null = null;
  private onCloseCallback: (() => void) | null = null;
  private sound: SoundEngine;

  constructor(sound: SoundEngine) {
    this.sound = sound;
    this.closeBtn.addEventListener('click', () => this.close());
  }

  public get isOpen(): boolean {
    return this.activePart !== null;
  }

  public open(
    part: ShipPartState,
    onComplete: (part: ShipPartState) => void,
    onClose: () => void
  ): void {
    this.cleanupCurrent();
    this.activePart = part;
    this.onCompleteCallback = onComplete;
    this.onCloseCallback = onClose;

    if (document.pointerLockElement) {
      document.exitPointerLock();
    }

    this.titleEl.textContent = `REPAIR: ${part.name.toUpperCase()}`;
    this.overlay.classList.add('active');
    this.stageEl.innerHTML = '';

    switch (part.minigame) {
      case 'wires':
        this.buildWiresGame();
        break;
      case 'circles':
        this.buildMovingCirclesGame();
        break;
      case 'timing':
        this.buildTimingRingGame();
        break;
      case 'sliders':
        this.buildSlidersGame();
        break;
      case 'keypad':
        this.buildKeypadGame();
        break;
    }
  }

  public updateTimerHUD(): void {
    if (!this.activePart) return;
    if (!this.activePart.damaged || this.activePart.ruptured) {
      this.close();
      return;
    }
    this.timerTextEl.textContent = `${this.activePart.timer.toFixed(1)}s`;
    const pct = Math.max(0, Math.min(100, (this.activePart.timer / this.activePart.maxTimer) * 100));
    this.ruptureFillEl.style.width = `${pct}%`;
  }

  public close(): void {
    const hadPart = this.activePart !== null;
    this.cleanupCurrent();
    this.activePart = null;
    this.overlay.classList.remove('active');
    if (hadPart && this.onCloseCallback) {
      this.onCloseCallback();
    }
  }

  private complete(): void {
    if (!this.activePart) return;
    const finished = this.activePart;
    this.sound.playRepairSuccess();
    this.cleanupCurrent();
    this.activePart = null;
    this.overlay.classList.remove('active');
    if (this.onCompleteCallback) {
      this.onCompleteCallback(finished);
    }
  }

  private cleanupCurrent(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.cleanupFn) {
      this.cleanupFn();
      this.cleanupFn = null;
    }
  }

  // 1. CONNECTING WIRES MINIGAME
  private buildWiresGame(): void {
    this.instructionsEl.textContent =
      'Drag (or click) each frayed wire on the LEFT to its matching color terminal on the RIGHT.';

    const canvas = document.createElement('canvas');
    canvas.width = 560;
    canvas.height = 290;
    canvas.style.cursor = 'pointer';
    this.stageEl.appendChild(canvas);
    const ctx = canvas.getContext('2d')!;

    const colors = [
      { hex: '#ef4444', label: 'A' },
      { hex: '#facc15', label: 'B' },
      { hex: '#38bdf8', label: 'C' },
      { hex: '#4ade80', label: 'D' },
    ];

    const rightOrder = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    const leftNodes = colors.map((c, idx) => ({
      idx,
      x: 78,
      y: 48 + idx * 64,
      color: c.hex,
      label: c.label,
      connectedToRightSlot: -1,
    }));
    const rightNodes = rightOrder.map((colorIdx, slot) => ({
      slot,
      colorIdx,
      x: 482,
      y: 48 + slot * 64,
      color: colors[colorIdx].hex,
      label: colors[colorIdx].label,
    }));

    let selectedLeft: number | null = null;
    let mouseX = 0;
    let mouseY = 0;

    const getPos = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) / r.width) * canvas.width,
        y: ((e.clientY - r.top) / r.height) * canvas.height,
      };
    };

    const onDown = (e: MouseEvent) => {
      const p = getPos(e);
      mouseX = p.x;
      mouseY = p.y;

      for (const ln of leftNodes) {
        if (Math.hypot(p.x - ln.x, p.y - ln.y) < 26 && ln.connectedToRightSlot === -1) {
          selectedLeft = ln.idx;
          this.sound.playMiniClick(true);
          return;
        }
      }

      if (selectedLeft !== null) {
        tryConnectRight(p.x, p.y);
      }
    };

    const onMove = (e: MouseEvent) => {
      const p = getPos(e);
      mouseX = p.x;
      mouseY = p.y;
    };

    const tryConnectRight = (px: number, py: number) => {
      if (selectedLeft === null) return;
      for (const rn of rightNodes) {
        if (Math.hypot(px - rn.x, py - rn.y) < 28) {
          if (rn.colorIdx === selectedLeft) {
            leftNodes[selectedLeft].connectedToRightSlot = rn.slot;
            selectedLeft = null;
            this.sound.playMiniClick(true);
            if (leftNodes.every((n) => n.connectedToRightSlot !== -1)) {
              setTimeout(() => this.complete(), 140);
            }
          } else {
            selectedLeft = null;
            this.sound.playMiniClick(false);
          }
          return;
        }
      }
    };

    const onUp = (e: MouseEvent) => {
      if (selectedLeft === null) return;
      const p = getPos(e);
      // Only auto-finish on mouseup if dragged near right side; otherwise allow click-then-click!
      if (p.x > 360) {
        tryConnectRight(p.x, p.y);
      }
    };

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    const render = () => {
      ctx.fillStyle = '#05101c';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Grid lines
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 35) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      // Draw completed wires
      for (const ln of leftNodes) {
        if (ln.connectedToRightSlot !== -1) {
          const rn = rightNodes[ln.connectedToRightSlot];
          ctx.strokeStyle = ln.color;
          ctx.lineWidth = 9;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(ln.x, ln.y);
          ctx.bezierCurveTo(ln.x + 140, ln.y, rn.x - 140, rn.y, rn.x, rn.y);
          ctx.stroke();
        }
      }

      // Draw active wire being dragged
      if (selectedLeft !== null) {
        const ln = leftNodes[selectedLeft];
        ctx.strokeStyle = ln.color;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(ln.x, ln.y);
        ctx.lineTo(mouseX, mouseY);
        ctx.stroke();
      }

      // Draw terminals
      for (const ln of leftNodes) {
        ctx.fillStyle = ln.color;
        ctx.beginPath();
        ctx.arc(ln.x, ln.y, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = selectedLeft === ln.idx ? '#ffffff' : '#0f172a';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = '#020617';
        ctx.font = 'bold 15px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(ln.label, ln.x, ln.y + 5);
      }

      for (const rn of rightNodes) {
        ctx.fillStyle = rn.color;
        ctx.beginPath();
        ctx.arc(rn.x, rn.y, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = '#020617';
        ctx.font = 'bold 15px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(rn.label, rn.x, rn.y + 5);
      }

      this.rafId = requestAnimationFrame(render);
    };
    this.rafId = requestAnimationFrame(render);

    this.cleanupFn = () => {
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }

  // 2. CLICKING MOVING CIRCLES MINIGAME
  private buildMovingCirclesGame(): void {
    this.instructionsEl.textContent =
      'Click all 7 moving pressure-leak circles to plasma-weld the hull plating shut!';

    const canvas = document.createElement('canvas');
    canvas.width = 560;
    canvas.height = 290;
    canvas.style.cursor = 'crosshair';
    this.stageEl.appendChild(canvas);
    const ctx = canvas.getContext('2d')!;

    interface LeakCircle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      sealed: boolean;
    }

    const circles: LeakCircle[] = [];
    for (let i = 0; i < 7; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 85 + Math.random() * 85;
      circles.push({
        x: 70 + Math.random() * 420,
        y: 55 + Math.random() * 180,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        r: 23,
        sealed: false,
      });
    }

    const onDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const my = ((e.clientY - rect.top) / rect.height) * canvas.height;

      for (const c of circles) {
        if (!c.sealed && Math.hypot(mx - c.x, my - c.y) <= c.r + 7) {
          c.sealed = true;
          this.sound.playMiniClick(true);
          if (circles.every((item) => item.sealed)) {
            setTimeout(() => this.complete(), 120);
          }
          return;
        }
      }
      this.sound.playMiniClick(false);
    };

    canvas.addEventListener('mousedown', onDown);

    let last = performance.now();
    const render = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      ctx.fillStyle = '#071422';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      let remaining = 0;
      for (const c of circles) {
        if (!c.sealed) {
          remaining++;
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          if (c.x < c.r + 8 || c.x > canvas.width - c.r - 8) c.vx *= -1;
          if (c.y < c.r + 8 || c.y > canvas.height - c.r - 8) c.vy *= -1;

          // Spraying leak circle
          ctx.beginPath();
          ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(56, 189, 248, 0.28)';
          ctx.fill();
          ctx.lineWidth = 3.5;
          ctx.strokeStyle = '#38bdf8';
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(c.x, c.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#f87171';
          ctx.fill();
        } else {
          // Welded patch mark
          ctx.beginPath();
          ctx.arc(c.x, c.y, 14, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(249, 115, 22, 0.45)';
          ctx.fill();
          ctx.strokeStyle = '#4ade80';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      ctx.fillStyle = '#e0f2fe';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(`FRACTURES REMAINING: ${remaining}`, 16, 24);

      this.rafId = requestAnimationFrame(render);
    };
    this.rafId = requestAnimationFrame(render);

    this.cleanupFn = () => {
      canvas.removeEventListener('mousedown', onDown);
    };
  }

  // 3. TIMING CALIBRATION RING MINIGAME
  private buildTimingRingGame(): void {
    this.instructionsEl.textContent =
      'Click inside the dial (or press SPACE) when the spinning needle enters the GREEN zone 3 times!';

    const canvas = document.createElement('canvas');
    canvas.width = 560;
    canvas.height = 290;
    canvas.style.cursor = 'pointer';
    this.stageEl.appendChild(canvas);
    const ctx = canvas.getContext('2d')!;

    let hits = 0;
    const needed = 3;
    let angle = 0;
    let targetStart = Math.random() * Math.PI * 1.4;
    const targetArc = 0.85;

    const triggerHit = () => {
      const norm = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const end = targetStart + targetArc;
      const inZone =
        (norm >= targetStart && norm <= end) ||
        (end > Math.PI * 2 && norm <= end - Math.PI * 2);

      if (inZone) {
        hits++;
        this.sound.playMiniClick(true);
        targetStart = (targetStart + 1.7 + Math.random() * 1.8) % (Math.PI * 2);
        if (hits >= needed) {
          setTimeout(() => this.complete(), 120);
        }
      } else {
        this.sound.playMiniClick(false);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        triggerHit();
      }
    };
    canvas.addEventListener('mousedown', triggerHit);
    window.addEventListener('keydown', onKey);

    let last = performance.now();
    const render = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      angle += (2.8 + hits * 0.65) * dt;

      ctx.fillStyle = '#040e1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const radius = 96;

      // Outer track
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 22;
      ctx.stroke();

      // Target green arc
      ctx.beginPath();
      ctx.arc(cx, cy, radius, targetStart, targetStart + targetArc);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 22;
      ctx.stroke();

      // Spinning needle
      const nx = cx + Math.cos(angle) * (radius + 12);
      const ny = cy + Math.sin(angle) * (radius + 12);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(nx, ny);
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 5;
      ctx.stroke();

      ctx.fillStyle = '#f0f9ff';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${hits} / ${needed} SYNCED`, cx, cy + 7);

      this.rafId = requestAnimationFrame(render);
    };
    this.rafId = requestAnimationFrame(render);

    this.cleanupFn = () => {
      canvas.removeEventListener('mousedown', triggerHit);
      window.removeEventListener('keydown', onKey);
    };
  }

  // 4. HYDRAULIC PRESSURE SLIDERS MINIGAME
  private buildSlidersGame(): void {
    this.instructionsEl.textContent =
      'Adjust all 3 hydraulic ballast sliders so each valve aligns inside its GREEN target band.';

    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '20px';
    wrap.style.width = '84%';
    this.stageEl.appendChild(wrap);

    const targets = [
      22 + Math.floor(Math.random() * 56),
      22 + Math.floor(Math.random() * 56),
      22 + Math.floor(Math.random() * 56),
    ];
    const inputs: HTMLInputElement[] = [];

    const checkAll = () => {
      this.sound.playMiniClick(true);
      const allGood = inputs.every((inp, idx) => Math.abs(Number(inp.value) - targets[idx]) <= 8);
      if (allGood) {
        setTimeout(() => this.complete(), 160);
      }
    };

    targets.forEach((targ, idx) => {
      const row = document.createElement('div');
      row.style.position = 'relative';
      row.style.background = '#091d30';
      row.style.padding = '12px 14px';
      row.style.borderRadius = '8px';
      row.style.border = '1px solid rgba(56, 189, 248, 0.3)';

      const lbl = document.createElement('div');
      lbl.style.fontSize = '12px';
      lbl.style.fontWeight = '700';
      lbl.style.marginBottom = '6px';
      lbl.textContent = `VALVE #${idx + 1} — TARGET PRESSURE: ${targ} PSI`;

      const trackWrap = document.createElement('div');
      trackWrap.style.position = 'relative';

      const zone = document.createElement('div');
      zone.style.position = 'absolute';
      zone.style.left = `${targ - 8}%`;
      zone.style.width = '16%';
      zone.style.top = '-2px';
      zone.style.bottom = '-2px';
      zone.style.background = 'rgba(34, 197, 94, 0.38)';
      zone.style.border = '1px solid #4ade80';
      zone.style.borderRadius = '4px';
      zone.style.pointerEvents = 'none';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.value = targ > 50 ? '10' : '90';
      slider.style.width = '100%';
      slider.style.position = 'relative';
      slider.style.cursor = 'pointer';

      slider.addEventListener('input', () => {
        const ok = Math.abs(Number(slider.value) - targ) <= 8;
        row.style.borderColor = ok ? '#4ade80' : 'rgba(56, 189, 248, 0.3)';
        checkAll();
      });

      inputs.push(slider);
      trackWrap.append(zone, slider);
      row.append(lbl, trackWrap);
      wrap.appendChild(row);
    });
  }

  // 5. HYDROPHONE KEYPAD OVERRIDE MINIGAME
  private buildKeypadGame(): void {
    this.instructionsEl.textContent =
      'Enter the 5-digit emergency frequency code on the keypad to reboot the Sonar & Turret Relay.';

    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.gap = '14px';
    this.stageEl.appendChild(container);

    const code: number[] = [];
    for (let i = 0; i < 5; i++) {
      code.push(1 + Math.floor(Math.random() * 9));
    }
    let step = 0;

    const display = document.createElement('div');
    display.style.fontFamily = 'monospace';
    display.style.fontSize = '22px';
    display.style.fontWeight = '900';
    display.style.letterSpacing = '6px';
    display.style.padding = '8px 20px';
    display.style.background = '#071c2e';
    display.style.border = '1px solid #38bdf8';
    display.style.borderRadius = '6px';

    const updateDisplay = () => {
      display.innerHTML = code
        .map((digit, idx) =>
          idx < step
            ? `<span style="color:#4ade80">${digit}</span>`
            : `<span style="color:#bae6fd">${digit}</span>`
        )
        .join(' ');
    };
    updateDisplay();

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(3, 68px)';
    grid.style.gap = '8px';

    for (let n = 1; n <= 9; n++) {
      const btn = document.createElement('button');
      btn.textContent = String(n);
      btn.style.height = '46px';
      btn.style.background = '#0f2942';
      btn.style.border = '1px solid #38bdf8';
      btn.style.borderRadius = '6px';
      btn.style.color = '#f0f9ff';
      btn.style.fontSize = '18px';
      btn.style.fontWeight = '800';
      btn.style.cursor = 'pointer';

      btn.addEventListener('click', () => {
        if (n === code[step]) {
          step++;
          this.sound.playMiniClick(true);
          updateDisplay();
          if (step >= code.length) {
            setTimeout(() => this.complete(), 120);
          }
        } else {
          step = 0;
          this.sound.playMiniClick(false);
          updateDisplay();
        }
      });
      grid.appendChild(btn);
    }

    container.append(display, grid);
  }
}
