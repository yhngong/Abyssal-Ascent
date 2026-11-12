import * as THREE from 'three';
import { DifficultyConfig, MonsterType } from './types';

export interface MonsterInstance {
  id: number;
  type: MonsterType;
  name: string;
  group: THREE.Group;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  hp: number;
  maxHp: number;
  baseSpeed: number;
  hitRadius: number;
  armorAgainstBullets: number; // 1.0 = normal, 0.15 = heavily armored
  harpoonMultiplier: number;   // >1 = weak to harpoons
  agitated: boolean;
  sonarRevealTimer: number;
  hitFlashTimer: number;
  animSeed: number;
  driftDir: THREE.Vector3;
  partsToAnimate: THREE.Object3D[];
}

export interface MonsterAttackEvent {
  monsterName: string;
  monsterType: MonsterType;
  empShock: boolean;
}

let nextMonsterId = 1;

export class MonsterManager {
  public group = new THREE.Group();
  public monsters: MonsterInstance[] = [];
  private spawnTimer = 2.5;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  public clearAll(): void {
    for (const m of this.monsters) {
      this.group.remove(m.group);
    }
    this.monsters = [];
    this.spawnTimer = 2.5;
  }

  public revealAllWithSonar(duration = 4.8): void {
    for (const m of this.monsters) {
      m.sonarRevealTimer = duration;
    }
  }

  public update(
    dt: number,
    time: number,
    depth: number,
    diff: DifficultyConfig,
    noiseLevel: number,
    lightsOn: boolean
  ): MonsterAttackEvent[] {
    const attacks: MonsterAttackEvent[] = [];

    // Spawn pacing scales slightly faster as you ascend into mid/deep zones, easing only right at 0-120m surface
    const surfaceCalm = depth < 140 ? 1.8 : 1.0;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.monsters.length < diff.maxConcurrentMonsters && depth > 35) {
      this.spawnMonsterForDepth(depth, diff);
      const jitter = 0.75 + Math.random() * 0.5;
      this.spawnTimer = diff.spawnIntervalSec * jitter * surfaceCalm;
    }

    // Target point is the submarine bridge nose around (0, 1.2, -4.0)
    const subTarget = new THREE.Vector3(0, 1.2, -4.0);

    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];
      m.sonarRevealTimer = Math.max(0, m.sonarRevealTimer - dt);
      m.hitFlashTimer = Math.max(0, m.hitFlashTimer - dt);

      const toSub = subTarget.clone().sub(m.position);
      const dist = toSub.length();
      const dirToSub = toSub.clone().normalize();

      let desiredDir = dirToSub.clone();
      let speed = m.baseSpeed * diff.monsterSpeedMult;
      m.agitated = true;

      // Species-specific sensory & combat behavior
      switch (m.type) {
        case 'blind_stalker': {
          // Blind! Only hears motor/weapons/sonar noise
          if (noiseLevel >= 0.2) {
            m.agitated = true;
            speed *= 1.38 + noiseLevel * 0.45;
            desiredDir.copy(dirToSub);
          } else {
            // Motor is OFF and player is quiet -> drifts past harmlessly!
            m.agitated = false;
            speed *= 0.65;
            desiredDir.copy(m.driftDir);
          }
          break;
        }

        case 'photovore': {
          // Attracted to ship Floodlights!
          if (lightsOn) {
            m.agitated = true;
            speed *= 1.35;
            desiredDir.copy(dirToSub);
          } else {
            // Floodlights OFF -> loses lock and wanders away!
            m.agitated = false;
            speed *= 0.58;
            desiredDir.copy(m.driftDir);
          }
          break;
        }

        case 'shadow_kraken': {
          // Hates bright light! Charges in darkness, seared/slowed when Floodlights ON
          if (!lightsOn) {
            m.agitated = true;
            speed *= 1.42;
            desiredDir.copy(dirToSub);
          } else {
            m.agitated = false;
            speed *= 0.28; // Burned and slowed by bright floodlight!
            desiredDir.copy(dirToSub);
          }
          break;
        }

        case 'razor_swarm': {
          // Fast corkscrew weave toward ship
          const perp = new THREE.Vector3(-dirToSub.z, Math.sin(time * 5 + m.animSeed) * 0.5, dirToSub.x).normalize();
          desiredDir.addScaledVector(perp, Math.sin(time * 4.2 + m.animSeed) * 0.55).normalize();
          break;
        }

        case 'crusher': {
          // Unstoppable armored juggernaut
          speed *= 0.92;
          break;
        }

        case 'volt_jelly': {
          // Pulsing jellyfish surge
          speed *= 0.85 + 0.45 * Math.abs(Math.sin(time * 2.6 + m.animSeed));
          break;
        }

        case 'mimic_siren': {
          // Pretends to drift calmly until within 34m, then lunges!
          if (dist > 34 && m.hp === m.maxHp) {
            m.agitated = false;
            speed *= 0.48;
          } else {
            m.agitated = true;
            speed *= 1.55;
          }
          break;
        }
      }

      m.velocity.lerp(desiredDir.multiplyScalar(speed), Math.min(1, dt * 3.5));
      m.position.addScaledVector(m.velocity, dt);
      m.group.position.copy(m.position);

      // Orient monster toward velocity
      const lookPoint = m.position.clone().add(m.velocity);
      m.group.lookAt(lookPoint);

      // Animate procedural limbs / tails / lures
      this.animateMonster(m, time);

      // Despawn if a passive monster drifted far away (> 128m) or behind sub
      if (dist > 132 || m.position.z > 18) {
        this.group.remove(m.group);
        this.monsters.splice(i, 1);
        continue;
      }

      // Check if monster reached the submarine hull!
      if (dist <= 6.2) {
        attacks.push({
          monsterName: m.name,
          monsterType: m.type,
          empShock: m.type === 'volt_jelly',
        });
        this.group.remove(m.group);
        this.monsters.splice(i, 1);
      }
    }

    return attacks;
  }

  public damageMonster(
    m: MonsterInstance,
    rawDamage: number,
    weapon: 'harpoon' | 'bullets'
  ): { killed: boolean; ricochet: boolean; actualDamage: number } {
    let mult = 1.0;
    let ricochet = false;
    if (weapon === 'bullets') {
      mult = m.armorAgainstBullets;
      if (mult < 0.35) ricochet = true;
    } else {
      mult = m.harpoonMultiplier;
    }

    const actualDamage = rawDamage * mult;
    m.hp -= actualDamage;
    m.hitFlashTimer = 0.14;
    m.agitated = true;

    if (m.hp <= 0) {
      const idx = this.monsters.indexOf(m);
      if (idx !== -1) {
        this.group.remove(m.group);
        this.monsters.splice(idx, 1);
      }
      return { killed: true, ricochet, actualDamage };
    }
    return { killed: false, ricochet, actualDamage };
  }

  private spawnMonsterForDepth(depth: number, diff: DifficultyConfig): void {
    // Weighted pool so all 7 monsters appear, with signature deep terror early & diverse combos throughout
    const pool: MonsterType[] = ['blind_stalker', 'photovore', 'razor_swarm'];
    if (depth > 2500) {
      pool.push('blind_stalker', 'shadow_kraken', 'crusher');
    } else {
      pool.push('shadow_kraken', 'crusher');
    }
    if (depth < 10800) {
      pool.push('volt_jelly', 'mimic_siren', 'photovore');
    }

    const chosen = pool[Math.floor(Math.random() * pool.length)];
    const instance = this.createMonsterInstance(chosen, diff.monsterHpMult);

    // Spawn in front of the panoramic viewport dome (-Z) within wide field of view
    const angleX = (Math.random() - 0.5) * 1.45; // ~83 deg horizontal spread
    const angleY = (Math.random() - 0.5) * 0.62;
    const spawnDist = 66 + Math.random() * 26;

    instance.position.set(
      Math.sin(angleX) * spawnDist,
      1.5 + Math.sin(angleY) * spawnDist * 0.55,
      -Math.cos(angleX) * spawnDist
    );
    instance.group.position.copy(instance.position);

    // Tangential pass-by vector for when player uses stealth (Motor OFF or Lights OFF)
    const sideSign = instance.position.x >= 0 ? 1 : -1;
    instance.driftDir = new THREE.Vector3(sideSign * 0.85, 0.18, 0.45).normalize();

    this.monsters.push(instance);
    this.group.add(instance.group);
  }

  private createMonsterInstance(type: MonsterType, hpMult: number): MonsterInstance {
    const g = new THREE.Group();
    const partsToAnimate: THREE.Object3D[] = [];
    let name = 'Abyssal Creature';
    let maxHp = 60;
    let baseSpeed = 9.5;
    let hitRadius = 2.4;
    let armorAgainstBullets = 1.0;
    let harpoonMultiplier = 1.0;

    switch (type) {
      case 'blind_stalker': {
        name = 'Blind Trench Stalker';
        maxHp = 75 * hpMult;
        baseSpeed = 11.2;
        hitRadius = 2.6;
        // Pale bone segmented eel with acoustic crimson gill frills (NO eyes!)
        const boneMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.55, metalness: 0.15 });
        const frillMat = new THREE.MeshBasicMaterial({ color: 0xff2a4b, side: THREE.DoubleSide });
        const mawMat = new THREE.MeshBasicMaterial({ color: 0x450a0a });

        const head = new THREE.Mesh(new THREE.ConeGeometry(1.05, 2.4, 10), boneMat);
        head.rotation.x = Math.PI / 2;
        g.add(head);

        const maw = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.16, 8, 16), mawMat);
        maw.position.z = 1.05;
        g.add(maw);

        // Acoustic gill frills that flare when hearing motor
        for (const side of [-1, 1]) {
          const frill = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.3), frillMat);
          frill.position.set(side * 0.95, 0.1, -0.2);
          frill.rotation.y = side * 0.55;
          partsToAnimate.push(frill);
          g.add(frill);
        }

        // Segmented serpentine spine
        for (let s = 1; s <= 6; s++) {
          const seg = new THREE.Mesh(
            new THREE.SphereGeometry(Math.max(0.28, 0.95 - s * 0.11), 10, 10),
            boneMat
          );
          seg.position.z = -s * 1.15;
          partsToAnimate.push(seg);
          g.add(seg);
        }
        break;
      }

      case 'photovore': {
        name = 'Photovore Angler-Ray';
        maxHp = 65 * hpMult;
        baseSpeed = 10.6;
        hitRadius = 2.8;
        const bodyMat = new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          emissive: 0x422006,
          roughness: 0.4,
        });
        const wingMat = new THREE.MeshStandardMaterial({
          color: 0x334155,
          emissive: 0x713f12,
          emissiveIntensity: 0.45,
          side: THREE.DoubleSide,
        });
        const lureMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

        const torso = new THREE.Mesh(new THREE.SphereGeometry(1.15, 14, 12), bodyMat);
        torso.scale.set(1.1, 0.85, 1.45);
        g.add(torso);

        // Giant reflective golden eyes
        for (const sx of [-0.55, 0.55]) {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), lureMat);
          eye.position.set(sx, 0.28, 1.1);
          g.add(eye);
        }

        // Dangling bioluminescent angler lure
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), bodyMat);
        stalk.position.set(0, 0.95, 1.15);
        stalk.rotation.x = 0.65;
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), lureMat);
        bulb.position.set(0, 1.45, 1.75);
        partsToAnimate.push(bulb);
        g.add(stalk, bulb);

        // Flapping manta wings
        for (const side of [-1, 1]) {
          const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 1.9), wingMat);
          wing.position.set(side * 1.65, 0, -0.1);
          partsToAnimate.push(wing);
          g.add(wing);
        }
        break;
      }

      case 'shadow_kraken': {
        name = 'Void Shadow Kraken';
        maxHp = 85 * hpMult;
        baseSpeed = 10.2;
        hitRadius = 2.9;
        const darkMat = new THREE.MeshStandardMaterial({
          color: 0x090514,
          emissive: 0x2e1065,
          emissiveIntensity: 0.5,
          roughness: 0.7,
        });
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xc084fc });

        const mantle = new THREE.Mesh(new THREE.ConeGeometry(1.35, 3.4, 12), darkMat);
        mantle.rotation.x = -Math.PI / 2;
        mantle.position.z = -1.1;
        g.add(mantle);

        for (const sx of [-0.58, 0.58]) {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10), eyeMat);
          eye.position.set(sx, 0.2, 0.55);
          g.add(eye);
        }

        // 6 writhing tentacles
        for (let t = 0; t < 6; t++) {
          const ang = (t / 6) * Math.PI * 2;
          const tent = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.03, 2.8, 8), darkMat);
          tent.rotation.x = Math.PI / 2;
          tent.position.set(Math.cos(ang) * 0.75, Math.sin(ang) * 0.75, 1.35);
          partsToAnimate.push(tent);
          g.add(tent);
        }
        break;
      }

      case 'crusher': {
        name = 'Crusher Leviathan';
        maxHp = 135 * hpMult;
        baseSpeed = 7.6;
        hitRadius = 3.5;
        armorAgainstBullets = 0.15; // Bulletproof chitin!
        harpoonMultiplier = 2.4;    // Weak to Heavy Harpoons!

        const shellMat = new THREE.MeshStandardMaterial({
          color: 0x291d18,
          metalness: 0.65,
          roughness: 0.35,
        });
        const coreMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });

        const carapace = new THREE.Mesh(new THREE.DodecahedronGeometry(2.15, 1), shellMat);
        carapace.scale.set(1.25, 0.95, 1.45);
        g.add(carapace);

        // Glowing molten maw
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.88, 12, 12), coreMat);
        core.position.set(0, -0.1, 1.85);
        g.add(core);

        // Heavy armored claws/mandibles
        for (const side of [-1, 1]) {
          const claw = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.95, 2.3), shellMat);
          claw.position.set(side * 1.75, -0.2, 1.45);
          claw.rotation.y = -side * 0.3;
          partsToAnimate.push(claw);
          g.add(claw);
        }
        break;
      }

      case 'razor_swarm': {
        name = 'Razor Viper Swarm';
        maxHp = 46 * hpMult;
        baseSpeed = 13.5;
        hitRadius = 2.7;
        harpoonMultiplier = 0.85;
        armorAgainstBullets = 1.45; // Shredded by 20mm rotary cannon!

        const fishMat = new THREE.MeshStandardMaterial({
          color: 0x10b981,
          emissive: 0x059669,
          emissiveIntensity: 0.6,
          metalness: 0.5,
        });
        for (let f = 0; f < 6; f++) {
          const subFish = new THREE.Group();
          const body = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.2, 7), fishMat);
          body.rotation.x = Math.PI / 2;
          subFish.add(body);
          subFish.position.set(
            (Math.random() - 0.5) * 2.4,
            (Math.random() - 0.5) * 1.8,
            (Math.random() - 0.5) * 2.0
          );
          partsToAnimate.push(subFish);
          g.add(subFish);
        }
        break;
      }

      case 'volt_jelly': {
        name = 'Volt EMP Siphonophore';
        maxHp = 58 * hpMult;
        baseSpeed = 9.0;
        hitRadius = 2.6;

        const bellMat = new THREE.MeshPhysicalMaterial({
          color: 0x06b6d4,
          emissive: 0x22d3ee,
          emissiveIntensity: 0.75,
          transparent: true,
          opacity: 0.78,
        });
        const bell = new THREE.Mesh(
          new THREE.SphereGeometry(1.55, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.6),
          bellMat
        );
        bell.rotation.x = Math.PI / 2;
        partsToAnimate.push(bell);
        g.add(bell);

        const arcRing = new THREE.Mesh(
          new THREE.TorusGeometry(1.75, 0.06, 8, 24),
          new THREE.MeshBasicMaterial({ color: 0x67e8f9 })
        );
        partsToAnimate.push(arcRing);
        g.add(arcRing);

        for (let t = 0; t < 5; t++) {
          const strand = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.02, 3.2, 6),
            new THREE.MeshBasicMaterial({ color: 0x22d3ee })
          );
          strand.rotation.x = Math.PI / 2;
          strand.position.set(Math.cos(t * 1.25) * 0.7, Math.sin(t * 1.25) * 0.7, -1.6);
          g.add(strand);
        }
        break;
      }

      case 'mimic_siren': {
        name = 'Mimic Lantern-Siren';
        maxHp = 68 * hpMult;
        baseSpeed = 11.0;
        hitRadius = 2.5;

        const hideMat = new THREE.MeshStandardMaterial({ color: 0x13111c, roughness: 0.85 });
        const lureOrbMat = new THREE.MeshBasicMaterial({ color: 0xf472b6 });
        const jawMat = new THREE.MeshBasicMaterial({ color: 0xfb7185 });

        const body = new THREE.Mesh(new THREE.SphereGeometry(1.25, 12, 12), hideMat);
        body.scale.set(1, 0.9, 1.5);
        g.add(body);

        // Deceptive pretty glowing orb out front
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 12), lureOrbMat);
        orb.position.set(0, 0.45, 1.9);
        partsToAnimate.push(orb);
        g.add(orb);

        // Hidden jaws that open wide when agitated
        const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.14, 8, 14), jawMat);
        jaw.position.set(0, -0.15, 1.35);
        partsToAnimate.push(jaw);
        g.add(jaw);
        break;
      }
    }

    return {
      id: nextMonsterId++,
      type,
      name,
      group: g,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(0, 0, 5),
      hp: maxHp,
      maxHp,
      baseSpeed,
      hitRadius,
      armorAgainstBullets,
      harpoonMultiplier,
      agitated: true,
      sonarRevealTimer: 0,
      hitFlashTimer: 0,
      animSeed: Math.random() * 100,
      driftDir: new THREE.Vector3(1, 0, 0),
      partsToAnimate,
    };
  }

  private animateMonster(m: MonsterInstance, time: number): void {
    const t = time * 4 + m.animSeed;

    if (m.type === 'blind_stalker') {
      // Frills index 0, 1; spine segments 2..7
      for (let i = 0; i < 2; i++) {
        const frill = m.partsToAnimate[i] as THREE.Mesh;
        if (frill) {
          const mat = frill.material as THREE.MeshBasicMaterial;
          mat.color.setHex(m.agitated ? 0xff2a4b : 0x38bdf8);
          frill.scale.setScalar(m.agitated ? 1.15 + 0.15 * Math.sin(t * 2) : 0.65);
        }
      }
      for (let s = 2; s < m.partsToAnimate.length; s++) {
        m.partsToAnimate[s].position.x = Math.sin(t * 1.6 - s * 0.7) * 0.55;
      }
    } else if (m.type === 'photovore') {
      const bulb = m.partsToAnimate[0];
      if (bulb) bulb.scale.setScalar(0.9 + 0.25 * Math.sin(t * 2));
      if (m.partsToAnimate[1]) m.partsToAnimate[1].rotation.z = Math.sin(t * 1.5) * 0.38;
      if (m.partsToAnimate[2]) m.partsToAnimate[2].rotation.z = -Math.sin(t * 1.5) * 0.38;
    } else if (m.type === 'shadow_kraken') {
      m.partsToAnimate.forEach((tent, idx) => {
        tent.rotation.y = Math.sin(t + idx) * 0.32;
      });
    } else if (m.type === 'crusher') {
      if (m.partsToAnimate[0]) m.partsToAnimate[0].rotation.y = -0.3 + Math.sin(t) * 0.18;
      if (m.partsToAnimate[1]) m.partsToAnimate[1].rotation.y = 0.3 - Math.sin(t) * 0.18;
    } else if (m.type === 'razor_swarm') {
      m.partsToAnimate.forEach((fish, idx) => {
        fish.position.x = Math.cos(t * 1.8 + idx * 1.1) * 1.35;
        fish.position.y = Math.sin(t * 2.1 + idx * 1.4) * 1.05;
      });
    } else if (m.type === 'volt_jelly') {
      if (m.partsToAnimate[0]) {
        const s = 0.9 + 0.18 * Math.sin(t * 1.2);
        m.partsToAnimate[0].scale.set(s, s, 1.15 - 0.12 * Math.sin(t * 1.2));
      }
      if (m.partsToAnimate[1]) {
        m.partsToAnimate[1].rotation.z += 0.06;
      }
    } else if (m.type === 'mimic_siren') {
      const jaw = m.partsToAnimate[1];
      if (jaw) {
        jaw.visible = m.agitated;
        jaw.scale.setScalar(m.agitated ? 1.15 : 0.2);
      }
    }

    // Sonar wireframe/emissive highlight or hit flash
    m.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if ('emissive' in mat) {
          if (m.hitFlashTimer > 0) {
            mat.emissive.setHex(0xffffff);
            mat.emissiveIntensity = 1.5;
          } else if (m.sonarRevealTimer > 0) {
            mat.emissive.setHex(0x06b6d4);
            mat.emissiveIntensity = 0.9;
          } else if (m.type !== 'shadow_kraken' && m.type !== 'razor_swarm' && m.type !== 'volt_jelly') {
            mat.emissive.setHex(0x000000);
            mat.emissiveIntensity = 0;
          }
        }
      }
    });
  }
}
