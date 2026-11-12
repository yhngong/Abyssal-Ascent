import './style.css';
import * as THREE from 'three';
import { SoundEngine } from './audio';
import { HUDManager } from './hud';
import { MinigameController } from './minigames';
import { MonsterManager } from './monsters';
import { OceanEnvironment } from './ocean';
import { Submarine } from './submarine';
import {
  DIFFICULTIES,
  DifficultyConfig,
  ShipPartId,
  ShipPartState,
  STARTING_DEPTH,
} from './types';
import { WeaponSystem } from './weapons';

class AbyssalAscentGame {
  private container = document.getElementById('game-container') as HTMLDivElement;
  private startScreen = document.getElementById('start-screen') as HTMLDivElement;
  private endScreen = document.getElementById('end-screen') as HTMLDivElement;
  private diffGrid = document.getElementById('difficulty-grid') as HTMLDivElement;
  private startBtn = document.getElementById('btn-start-game') as HTMLButtonElement;
  private restartBtn = document.getElementById('btn-restart') as HTMLButtonElement;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private raycaster = new THREE.Raycaster();

  private sound = new SoundEngine();
  private ocean: OceanEnvironment;
  private sub: Submarine;
  private monsters: MonsterManager;
  private weapons: WeaponSystem;
  private minigames: MinigameController;
  private hud = new HUDManager();

  private selectedDiff: DifficultyConfig = DIFFICULTIES[1]; // Default: DIVER (Normal)
  private state: 'menu' | 'playing' | 'rupturing' | 'gameover' = 'menu';

  // Gameplay State
  private depth = STARTING_DEPTH;
  private floodPercent = 0;
  private piloting = true;
  private motorOn = true;
  private lightsOn = true;
  private sonarCooldown = 0;
  private weaponNoisePulse = 0;

  // Camera & Player Movement inside Submarine Cabin
  private playerPos = new THREE.Vector3(0, 1.65, -1.25);
  private walkYaw = 0;
  private walkPitch = 0;
  private turretYaw = 0;
  private turretPitch = 0;
  private shakeIntensity = 0;

  // Input State
  private keys = new Set<string>();
  private mouseDownLeft = false;
  private pointerLocked = false;
  private hoveredPart: ShipPartState | null = null;
  private hoveringPilotChair = false;

  // Run Stats
  private runTime = 0;
  private monstersKilled = 0;
  private partsRepaired = 0;
  private hullHitsTaken = 0;
  private ruptureCause = '';

  private clock = new THREE.Clock();

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 240);

    this.ocean = new OceanEnvironment(this.scene);
    this.sub = new Submarine(this.scene);
    this.monsters = new MonsterManager(this.scene);
    this.weapons = new WeaponSystem(this.scene);
    this.minigames = new MinigameController(this.sound);

    this.buildDifficultySelector();
    this.bindEvents();

    requestAnimationFrame(() => this.loop());
  }

  private buildDifficultySelector(): void {
    const renderCards = () => {
      this.diffGrid.innerHTML = '';
      for (const d of DIFFICULTIES) {
        const card = document.createElement('div');
        card.className = `diff-card ${d.id === this.selectedDiff.id ? 'selected' : ''}`;
        card.innerHTML = `
          <div class="diff-name" style="color:${d.color}">
            <span>${d.name}</span>
            <span style="font-size:11px;opacity:0.85">[${d.badge}]</span>
          </div>
          <div class="diff-desc">${d.description}</div>
          <div class="diff-stats">
            <div>Ascent Speed: <strong>${d.ascentSpeed} m/s</strong></div>
            <div>Breach Timer: <strong>${d.breachTimeSeconds}s</strong></div>
            <div>Max Leviathans: <strong>${d.maxConcurrentMonsters}</strong></div>
          </div>
        `;
        card.addEventListener('click', () => {
          this.selectedDiff = d;
          this.sound.init();
          this.sound.playMiniClick(true);
          renderCards();
        });
        this.diffGrid.appendChild(card);
      }
    };
    renderCards();
  }

  private bindEvents(): void {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this.startBtn.addEventListener('click', () => {
      this.sound.init();
      this.startNewRun();
    });

    this.restartBtn.addEventListener('click', () => {
      this.endScreen.classList.remove('active');
      this.startScreen.classList.add('active');
      this.hud.show(false);
      this.state = 'menu';
      this.sound.setMotorState(false, false, false);
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    });

    this.renderer.domElement.addEventListener('mousedown', (e) => {
      if (this.state !== 'playing' || this.minigames.isOpen) return;
      this.sound.init();

      if (!this.pointerLocked) {
        this.renderer.domElement.requestPointerLock?.();
      }

      if (e.button === 0) {
        if (this.piloting) {
          this.mouseDownLeft = true;
          this.tryFireWeapon();
        } else {
          this.tryCabinInteract();
        }
      } else if (e.button === 2 && this.piloting) {
        this.toggleWeapon();
      }
    });

    window.addEventListener('contextmenu', (e) => {
      if (this.state === 'playing') e.preventDefault();
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDownLeft = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (this.state !== 'playing' || this.minigames.isOpen) return;

      let dx = 0;
      let dy = 0;
      if (this.pointerLocked) {
        dx = e.movementX;
        dy = e.movementY;
      } else {
        // Smooth fallback aim if pointer isn't locked yet
        const nx = (e.clientX / window.innerWidth - 0.5) * 2;
        const ny = (e.clientY / window.innerHeight - 0.5) * 2;
        if (this.piloting) {
          this.turretYaw = -nx * 1.1;
          this.turretPitch = -ny * 0.68;
        }
        return;
      }

      const sens = 0.0022;
      if (this.piloting) {
        this.turretYaw = THREE.MathUtils.clamp(this.turretYaw - dx * sens, -1.28, 1.28);
        this.turretPitch = THREE.MathUtils.clamp(this.turretPitch - dy * sens, -0.78, 0.78);
      } else {
        this.walkYaw -= dx * sens;
        this.walkPitch = THREE.MathUtils.clamp(this.walkPitch - dy * sens, -1.35, 1.35);
      }
    });

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);

      if (e.code === 'Escape' && this.minigames.isOpen) {
        this.minigames.close();
        return;
      }

      if (this.state !== 'playing' || this.minigames.isOpen) return;

      switch (e.code) {
        case 'Digit1':
          this.weapons.activeWeapon = 'harpoon';
          this.sound.playMiniClick(true);
          break;
        case 'Digit2':
          this.weapons.activeWeapon = 'bullets';
          this.sound.playMiniClick(true);
          break;
        case 'KeyQ':
          this.toggleWeapon();
          break;
        case 'KeyR':
          if (this.weapons.startReload()) {
            this.sound.playMiniClick(true);
          }
          break;
        case 'KeyM':
          this.motorOn = !this.motorOn;
          this.sound.playMiniClick(this.motorOn);
          this.hud.showAlert(
            this.motorOn
              ? 'MAIN MOTOR ENGAGED — ASCENDING (NOISE ACTIVE)'
              : 'MAIN MOTOR CUT — SILENT STEALTH MODE',
            2.0
          );
          break;
        case 'KeyF':
        case 'KeyL':
          this.lightsOn = !this.lightsOn;
          this.sound.playMiniClick(this.lightsOn);
          break;
        case 'KeyC':
          this.trySonarPing();
          break;
        case 'Space':
        case 'Tab':
          e.preventDefault();
          this.togglePilotMode();
          break;
        case 'KeyE':
          if (this.piloting) {
            this.togglePilotMode();
          } else {
            this.tryCabinInteract();
          }
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
  }

  private startNewRun(): void {
    this.startScreen.classList.remove('active');
    this.endScreen.classList.remove('active');
    this.hud.show(true);

    this.state = 'playing';
    this.depth = STARTING_DEPTH;
    this.floodPercent = 0;
    this.piloting = true;
    this.motorOn = true;
    this.lightsOn = true;
    this.sonarCooldown = 0;
    this.weaponNoisePulse = 0;

    this.playerPos.set(0, 1.65, -1.25);
    this.walkYaw = Math.PI; // Facing cabin aft when standing up so stations are right in front of you!
    this.walkPitch = 0;
    this.turretYaw = 0;
    this.turretPitch = 0;
    this.shakeIntensity = 0;

    this.runTime = 0;
    this.monstersKilled = 0;
    this.partsRepaired = 0;
    this.hullHitsTaken = 0;
    this.ruptureCause = '';

    this.monsters.clearAll();
    this.weapons.reset();
    this.sub.resetParts(this.selectedDiff.breachTimeSeconds);

    this.hud.showAlert(
      `ASCENT INITIATED AT 12,000m [${this.selectedDiff.name}] — WATCH SONAR & HULL!`,
      4.0
    );

    this.renderer.domElement.requestPointerLock?.();
  }

  private toggleWeapon(): void {
    this.weapons.activeWeapon = this.weapons.activeWeapon === 'harpoon' ? 'bullets' : 'harpoon';
    this.sound.playMiniClick(true);
  }

  private togglePilotMode(): void {
    if (this.piloting) {
      // Stand up into cabin right behind the pilot chair, facing the cabin corridor so you see damaged parts!
      this.piloting = false;
      this.mouseDownLeft = false;
      this.playerPos.set(0, 1.65, -1.1);
      this.walkYaw = Math.PI;
      this.walkPitch = -0.05;
    } else {
      // Sit back down in Pilot Chair from anywhere near bridge (or quick-seat via Tab)
      this.piloting = true;
      this.turretYaw = 0;
      this.turretPitch = 0;
    }
    this.sound.playMiniClick(true);
  }

  private trySonarPing(): void {
    if (this.sonarCooldown > 0) return;
    this.sonarCooldown = 6.0;
    this.weaponNoisePulse = Math.max(this.weaponNoisePulse, 0.9);
    this.ocean.triggerSonarWave();
    this.monsters.revealAllWithSonar(5.0);
    this.sound.playSonarPing();
    this.hud.showAlert('SONAR PING EMITTED — DARK TARGETS REVEALED (HIGH NOISE!)', 2.4);
  }

  private tryFireWeapon(): void {
    if (!this.piloting || this.state !== 'playing' || this.minigames.isOpen) return;

    const turretDamaged = this.sub.isPartDamaged('sonar');
    const aimDir = new THREE.Vector3(0, 0, -1).applyEuler(
      new THREE.Euler(this.turretPitch, this.turretYaw, 0, 'YXZ')
    );

    const muzzle =
      this.weapons.activeWeapon === 'harpoon'
        ? this.sub.getHarpoonMuzzleWorldPos()
        : this.sub.getRotaryMuzzleWorldPos();

    // Converge projectile trajectory toward the point 48m along camera center ray
    const camOrigin = new THREE.Vector3(0, 1.48, -2.55);
    const targetPoint = camOrigin.addScaledVector(aimDir, 48);
    const shotDir = targetPoint.sub(muzzle).normalize();

    const result = this.weapons.fire(muzzle, shotDir, turretDamaged);
    if (result.fired) {
      this.sub.triggerWeaponRecoil(result.weapon);
      this.weaponNoisePulse = Math.min(1, this.weaponNoisePulse + result.noiseAdded);
      if (result.weapon === 'harpoon') {
        this.sound.playHarpoonFire();
      } else {
        this.sound.playBulletFire();
      }
    }
  }

  private tryCabinInteract(): void {
    if (this.hoveringPilotChair) {
      this.togglePilotMode();
      return;
    }
    if (this.hoveredPart) {
      if (this.hoveredPart.damaged) {
        this.openRepairForPart(this.hoveredPart);
      } else {
        this.hud.showAlert(`${this.hoveredPart.name.toUpperCase()} IS OPERATING NORMALLY`, 1.5);
      }
    }
  }

  private openRepairForPart(part: ShipPartState): void {
    this.mouseDownLeft = false;
    this.minigames.open(
      part,
      (repairedPart) => {
        this.sub.repairPart(repairedPart.id);
        this.partsRepaired++;
        this.hud.showAlert(`${repairedPart.name.toUpperCase()} REPAIRED & SEALED!`, 2.5);
        this.renderer.domElement.requestPointerLock?.();
      },
      () => {
        if (this.state === 'playing') {
          this.renderer.domElement.requestPointerLock?.();
        }
      }
    );
  }

  private loop(): void {
    requestAnimationFrame(() => this.loop());

    const dt = Math.min(0.05, this.clock.getDelta());
    const elapsed = this.clock.elapsedTime;

    if (this.state === 'menu' || this.state === 'gameover') {
      // Atmospheric idle camera preview inside the submarine bridge at 12,000m
      this.ocean.update(dt, this.depth, 10, true, elapsed);
      this.sub.update(dt, elapsed, true, true, 0, Math.sin(elapsed * 0.35) * 0.25, 0.04);
      this.camera.position.set(0, 1.52, -2.35);
      this.camera.rotation.set(0.03, Math.sin(elapsed * 0.35) * 0.22, 0, 'YXZ');
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.state === 'rupturing') {
      // Dramatic flooding & drowning sequence when a hull part broke open!
      this.floodPercent = Math.min(100, this.floodPercent + 48 * dt);
      this.shakeIntensity = 0.14;
      this.sub.update(dt, elapsed, false, false, this.floodPercent, this.turretYaw, this.turretPitch);
      this.ocean.update(dt, this.depth, 0, false, elapsed);
      this.applyCameraTransform();
      this.hud.update({
        dt,
        time: elapsed,
        depth: this.depth,
        zoneName: this.ocean.getZoneName(this.depth),
        ascentRate: 0,
        floodPercent: this.floodPercent,
        piloting: this.piloting,
        motorOn: false,
        overdrive: false,
        lightsOn: false,
        sonarCooldown: this.sonarCooldown,
        noiseLevel: 0,
        weapons: this.weapons,
        parts: this.sub.parts,
        monsters: this.monsters.monsters,
        sonarDamaged: true,
        promptText: 'CRITICAL HULL RUPTURE — CABIN FLOODING!',
        pointerLocked: this.pointerLocked,
        minigameOpen: false,
      });
      this.renderer.render(this.scene, this.camera);

      if (this.floodPercent >= 100) {
        this.finishGame(false, this.ruptureCause);
      }
      return;
    }

    // --- ACTIVE GAMEPLAY UPDATE ---
    this.runTime += dt;
    this.sonarCooldown = Math.max(0, this.sonarCooldown - dt);
    this.weaponNoisePulse = Math.max(0, this.weaponNoisePulse - dt * 0.65);
    this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 0.35);

    const overdrive =
      this.motorOn && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && !this.minigames.isOpen;

    // Ascent rate calculation (Main Turbine damage cuts speed by 50%)
    const turbinePenalty = this.sub.isPartDamaged('turbine') ? 0.5 : 1.0;
    const currentAscentRate = this.motorOn
      ? this.selectedDiff.ascentSpeed * (overdrive ? this.selectedDiff.overdriveMultiplier : 1.0) * turbinePenalty
      : 0;

    this.depth = Math.max(0, this.depth - currentAscentRate * dt);
    this.sound.setMotorState(this.motorOn, overdrive, true);

    // Check Surface Victory (0m reached!)
    if (this.depth <= 0) {
      this.finishGame(
        true,
        `You piloted NEREUS-VII all 12,000 meters from Challenger Deep back into sunlit open waters!`
      );
      return;
    }

    // Calculate current Acoustic Noise Signature (0..1)
    const motorNoise = this.motorOn ? (overdrive ? 0.88 : 0.52) : 0.0;
    const noiseLevel = Math.min(1, motorNoise + this.weaponNoisePulse);

    // Effective Floodlight state (Electrical damage causes erratic flickers)
    const elecDamaged = this.sub.isPartDamaged('electrical');
    const effectiveLightsOn = this.lightsOn && (!elecDamaged || Math.sin(elapsed * 27) > -0.3);

    // Continuous Rotary Autocannon firing when holding Left Mouse
    if (this.piloting && this.mouseDownLeft && this.weapons.activeWeapon === 'bullets' && !this.minigames.isOpen) {
      this.tryFireWeapon();
    }

    // Cabin WASD First-Person Movement
    if (!this.piloting && !this.minigames.isOpen) {
      this.updateCabinMovement(dt);
    }

    // Update Ocean, Monsters, Weapons, Submarine
    this.ocean.update(dt, this.depth, currentAscentRate, effectiveLightsOn, elapsed);

    const monsterAttacks = this.monsters.update(
      dt,
      elapsed,
      this.depth,
      this.selectedDiff,
      noiseLevel,
      effectiveLightsOn
    );

    for (const atk of monsterAttacks) {
      this.hullHitsTaken++;
      this.shakeIntensity = 0.16;
      this.sound.playHullImpact();
      this.hud.flashHullDamage();

      let damagedPart: ShipPartState;
      if (atk.empShock) {
        // Volt Siphonophore shocks Electrical Grid and forces lights ON!
        const targetId: ShipPartId = !this.sub.isPartDamaged('electrical') ? 'electrical' : 'sonar';
        damagedPart = this.sub.damageSpecificPart(targetId, this.selectedDiff.breachTimeSeconds);
        this.lightsOn = true;
      } else {
        damagedPart = this.sub.damageRandomPart(this.selectedDiff.breachTimeSeconds);
      }

      this.floodPercent = Math.min(99, this.floodPercent + 5.5);
      this.hud.showAlert(
        `⚠ ${atk.monsterName.toUpperCase()} HIT HULL! [${damagedPart.name.toUpperCase()}] BREACHED — PRESS [SPACE] TO REPAIR!`,
        4.0
      );
    }

    const wpnStats = this.weapons.update(dt, this.sub.getHarpoonMuzzleWorldPos(), this.monsters);
    if (wpnStats.hits > 0) {
      this.hud.flashHitmarker(wpnStats.ricochets > 0);
      if (wpnStats.ricochets > 0 && wpnStats.kills === 0) {
        this.sound.playRicochet();
        this.hud.showAlert('ARMOR RICOCHET! USE HEAVY HARPOON [1] TO PIERCE SHELL!', 1.8);
      } else {
        this.sound.playMonsterHit(wpnStats.kills > 0);
      }
      this.monstersKilled += wpnStats.kills;
    }

    const rupturedPart = this.sub.update(
      dt,
      elapsed,
      this.lightsOn,
      this.weapons.harpoonCooldown <= 0,
      this.floodPercent,
      this.turretYaw,
      this.turretPitch
    );

    // Passive cabin flooding from active breaches vs bilge draining when sealed
    const dmgCount = this.sub.countDamagedParts();
    if (dmgCount > 0) {
      const ballastPenalty = this.sub.isPartDamaged('ballast') ? 1.65 : 1.0;
      this.floodPercent += dmgCount * this.selectedDiff.passiveLeakRate * ballastPenalty * dt;
    } else if (this.floodPercent > 0) {
      this.floodPercent = Math.max(0, this.floodPercent - 2.6 * dt);
    }

    // Check Rupture or Full Cabin Flooding -> Drown!
    if (rupturedPart) {
      this.minigames.close();
      this.state = 'rupturing';
      this.ruptureCause = `${rupturedPart.name} was left un-repaired too long and ruptured open under crushing pressure at ${Math.round(this.depth).toLocaleString()}m!`;
      this.sound.setMotorState(false, false, false);
      this.sound.playRuptureDrown();
      return;
    }

    if (this.floodPercent >= 100) {
      this.minigames.close();
      this.sound.playRuptureDrown();
      this.finishGame(
        false,
        `Unsealed hull leaks flooded 100% of the submarine cabin and drowned the crew at ${Math.round(this.depth).toLocaleString()}m.`
      );
      return;
    }

    // Update Minigame live countdown bar if open
    if (this.minigames.isOpen) {
      this.minigames.updateTimerHUD();
    }

    // Position Camera & Check Cabin Raycast Interaction
    this.applyCameraTransform();
    const promptText = this.updateInteractionRaycast();

    this.hud.update({
      dt,
      time: elapsed,
      depth: this.depth,
      zoneName: this.ocean.getZoneName(this.depth),
      ascentRate: currentAscentRate,
      floodPercent: this.floodPercent,
      piloting: this.piloting,
      motorOn: this.motorOn,
      overdrive,
      lightsOn: effectiveLightsOn,
      sonarCooldown: this.sonarCooldown,
      noiseLevel,
      weapons: this.weapons,
      parts: this.sub.parts,
      monsters: this.monsters.monsters,
      sonarDamaged: this.sub.isPartDamaged('sonar'),
      promptText,
      pointerLocked: this.pointerLocked,
      minigameOpen: this.minigames.isOpen,
    });

    this.renderer.render(this.scene, this.camera);
  }

  private updateCabinMovement(dt: number): void {
    const forward = new THREE.Vector3(-Math.sin(this.walkYaw), 0, -Math.cos(this.walkYaw));
    const right = new THREE.Vector3(Math.cos(this.walkYaw), 0, -Math.sin(this.walkYaw));
    const move = new THREE.Vector3();

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) move.add(forward);
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) move.sub(forward);
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) move.add(right);
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) move.sub(right);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(4.8 * dt);
      this.playerPos.add(move);
    }

    // Clamp inside submarine walkable interior corridor
    this.playerPos.x = THREE.MathUtils.clamp(this.playerPos.x, -1.95, 1.95);
    this.playerPos.z = THREE.MathUtils.clamp(this.playerPos.z, -1.75, 5.55);
  }

  private applyCameraTransform(): void {
    const shakeX = (Math.random() - 0.5) * this.shakeIntensity;
    const shakeY = (Math.random() - 0.5) * this.shakeIntensity;

    if (this.piloting) {
      this.camera.position.set(shakeX, 1.48 + shakeY, -2.55);
      this.camera.rotation.set(this.turretPitch, this.turretYaw, 0, 'YXZ');
    } else {
      this.camera.position.set(
        this.playerPos.x + shakeX,
        this.playerPos.y + shakeY,
        this.playerPos.z
      );
      this.camera.rotation.set(this.walkPitch, this.walkYaw, 0, 'YXZ');
    }
  }

  private updateInteractionRaycast(): string | null {
    this.hoveredPart = null;
    this.hoveringPilotChair = false;

    if (this.piloting) return null;

    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.raycaster.far = 3.6;
    const hits = this.raycaster.intersectObjects(this.sub.getInteractables(), false);
    if (hits.length === 0) return null;

    const hitObj = hits[0].object;
    if (hitObj.userData.type === 'pilot_chair') {
      this.hoveringPilotChair = true;
      return '[E / CLICK] Sit in Pilot Seat (Turret & Controls)';
    }

    if (hitObj.userData.type === 'ship_part') {
      const partId = hitObj.userData.partId as ShipPartId;
      const part = this.sub.parts.find((p) => p.id === partId) || null;
      this.hoveredPart = part;
      if (part) {
        return part.damaged
          ? `[E / CLICK] REPAIR ${part.name.toUpperCase()} (${part.shortDesc}) — ${part.timer.toFixed(1)}s!`
          : `${part.name} — Integrity Sealed`;
      }
    }

    return null;
  }

  private finishGame(victory: boolean, reason: string): void {
    this.state = 'gameover';
    this.mouseDownLeft = false;
    this.sound.setMotorState(false, false, false);
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }

    this.hud.show(false);
    this.endScreen.classList.add('active');

    const badgeEl = document.getElementById('end-badge') as HTMLElement;
    const titleEl = document.getElementById('end-title') as HTMLElement;
    const reasonEl = document.getElementById('end-reason') as HTMLElement;
    const statsEl = document.getElementById('end-stats') as HTMLElement;

    badgeEl.textContent = victory
      ? `SURFACE REACHED // ${this.selectedDiff.name} DIFFICULTY`
      : `VESSEL LOST // ${this.selectedDiff.name} DIFFICULTY`;
    titleEl.textContent = victory ? 'SURFACED ALIVE — 0 METERS!' : 'DROWNED IN THE ABYSS';
    titleEl.style.color = victory ? '#4ade80' : '#f87171';
    reasonEl.textContent = reason;

    const mins = Math.floor(this.runTime / 60);
    const secs = Math.floor(this.runTime % 60);

    statsEl.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Final Depth Reached</div>
        <div class="stat-val">${victory ? '0m (SURFACE!)' : `${Math.round(this.depth).toLocaleString()}m`}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Survival Time</div>
        <div class="stat-val">${mins}m ${secs}s</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Monsters Repelled</div>
        <div class="stat-val">${this.monstersKilled}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Breaches Repaired</div>
        <div class="stat-val">${this.partsRepaired}</div>
      </div>
    `;
  }
}

new AbyssalAscentGame();
