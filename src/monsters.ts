import * as THREE from 'three';
import { DifficultyConfig, MonsterType } from './types';

interface MonsterAnimRefs {
  frills?: THREE.Object3D[];
  jaws?: THREE.Object3D[];
  spine?: THREE.Object3D[];
  wings?: { inner: THREE.Object3D; outer: THREE.Object3D; side: number }[];
  lure?: THREE.Object3D;
  tentacleChains?: THREE.Object3D[][];
  fins?: THREE.Object3D[];
  claws?: { arm: THREE.Object3D; pincer: THREE.Object3D; side: number }[];
  legs?: THREE.Object3D[];
  swarmFish?: { root: THREE.Object3D; tail: THREE.Object3D; jaw: THREE.Object3D; baseOffset: THREE.Vector3 }[];
  bell?: THREE.Object3D;
  arcRings?: THREE.Object3D[];
  petalJaws?: THREE.Object3D[];
}

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
  armorAgainstBullets: number;
  harpoonMultiplier: number;
  agitated: boolean;
  sonarRevealTimer: number;
  hitFlashTimer: number;
  animSeed: number;
  driftDir: THREE.Vector3;
  anim: MonsterAnimRefs;
}

export interface MonsterAttackEvent {
  monsterName: string;
  monsterType: MonsterType;
  empShock: boolean;
}

let nextMonsterId = 1;

function tagMaterialBaseEmissive(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mat = (obj as THREE.Mesh).material;
      const mats = Array.isArray(mat) ? mat : [mat];
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial;
        if (std && 'emissive' in std && std.userData.baseEmissiveHex === undefined) {
          std.userData.baseEmissiveHex = std.emissive.getHex();
          std.userData.baseEmissiveIntensity = std.emissiveIntensity;
        }
      }
    }
  });
}

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

    const surfaceCalm = depth < 140 ? 1.8 : 1.0;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.monsters.length < diff.maxConcurrentMonsters && depth > 35) {
      this.spawnMonsterForDepth(depth, diff);
      const jitter = 0.75 + Math.random() * 0.5;
      this.spawnTimer = diff.spawnIntervalSec * jitter * surfaceCalm;
    }

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

      switch (m.type) {
        case 'blind_stalker': {
          if (noiseLevel >= 0.2) {
            m.agitated = true;
            speed *= 1.38 + noiseLevel * 0.45;
            desiredDir.copy(dirToSub);
          } else {
            m.agitated = false;
            speed *= 0.65;
            desiredDir.copy(m.driftDir);
          }
          break;
        }

        case 'photovore': {
          if (lightsOn) {
            m.agitated = true;
            speed *= 1.35;
            desiredDir.copy(dirToSub);
          } else {
            m.agitated = false;
            speed *= 0.58;
            desiredDir.copy(m.driftDir);
          }
          break;
        }

        case 'shadow_kraken': {
          if (!lightsOn) {
            m.agitated = true;
            speed *= 1.42;
            desiredDir.copy(dirToSub);
          } else {
            m.agitated = false;
            speed *= 0.28;
            desiredDir.copy(dirToSub);
          }
          break;
        }

        case 'razor_swarm': {
          const perp = new THREE.Vector3(-dirToSub.z, Math.sin(time * 5 + m.animSeed) * 0.5, dirToSub.x).normalize();
          desiredDir.addScaledVector(perp, Math.sin(time * 4.2 + m.animSeed) * 0.55).normalize();
          break;
        }

        case 'crusher': {
          speed *= 0.92;
          break;
        }

        case 'volt_jelly': {
          speed *= 0.85 + 0.45 * Math.abs(Math.sin(time * 2.6 + m.animSeed));
          break;
        }

        case 'mimic_siren': {
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

      const lookPoint = m.position.clone().add(m.velocity);
      m.group.lookAt(lookPoint);

      this.animateMonster(m, time);

      if (dist > 132 || m.position.z > 18) {
        this.group.remove(m.group);
        this.monsters.splice(i, 1);
        continue;
      }

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

    const angleX = (Math.random() - 0.5) * 1.45;
    const angleY = (Math.random() - 0.5) * 0.62;
    const spawnDist = 66 + Math.random() * 26;

    instance.position.set(
      Math.sin(angleX) * spawnDist,
      1.5 + Math.sin(angleY) * spawnDist * 0.55,
      -Math.cos(angleX) * spawnDist
    );
    instance.group.position.copy(instance.position);

    const sideSign = instance.position.x >= 0 ? 1 : -1;
    instance.driftDir = new THREE.Vector3(sideSign * 0.85, 0.18, 0.45).normalize();

    this.monsters.push(instance);
    this.group.add(instance.group);
  }

  private createMonsterInstance(type: MonsterType, hpMult: number): MonsterInstance {
    const g = new THREE.Group();
    const anim: MonsterAnimRefs = {};
    let name = 'Abyssal Creature';
    let maxHp = 60;
    let baseSpeed = 9.5;
    let hitRadius = 2.4;
    let armorAgainstBullets = 1.0;
    let harpoonMultiplier = 1.0;

    switch (type) {
      // -------------------------------------------------------------------------
      // 1. BLIND TRENCH STALKER: Eyeless bone-plated eel with 14 fangs, hinged
      //    jaws, 6 feathered acoustic gill fans, dorsal fin membrane & 10 spine segments
      // -------------------------------------------------------------------------
      case 'blind_stalker': {
        name = 'Blind Trench Stalker';
        maxHp = 75 * hpMult;
        baseSpeed = 11.2;
        hitRadius = 2.7;

        const boneMat = new THREE.MeshStandardMaterial({
          color: 0xd8e0e8,
          roughness: 0.48,
          metalness: 0.18,
        });
        const fleshMat = new THREE.MeshStandardMaterial({
          color: 0x6b1d2f,
          emissive: 0x3b0813,
          emissiveIntensity: 0.55,
          roughness: 0.6,
        });
        const toothMat = new THREE.MeshStandardMaterial({
          color: 0xfef9c3,
          roughness: 0.25,
          metalness: 0.1,
        });
        const frillMat = new THREE.MeshBasicMaterial({
          color: 0xff2a4b,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9,
        });
        const poreMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });

        // Armored eyeless cranium dome + scarred blind eye sockets
        const cranium = new THREE.Mesh(new THREE.SphereGeometry(1.05, 16, 14), boneMat);
        cranium.scale.set(0.95, 0.82, 1.55);
        g.add(cranium);

        const browRidge = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.28, 1.5), boneMat);
        browRidge.position.set(0, 0.48, 0.35);
        browRidge.rotation.x = 0.18;
        g.add(browRidge);

        // Sunken eyeless sockets (proving it is completely blind!)
        const pitMat = new THREE.MeshBasicMaterial({ color: 0x1a080d });
        for (const side of [-1, 1]) {
          const socket = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), pitMat);
          socket.scale.set(0.6, 0.8, 1.1);
          socket.position.set(side * 0.72, 0.22, 0.65);
          g.add(socket);
        }

        // Inner gullet glow
        const gullet = new THREE.Mesh(new THREE.SphereGeometry(0.65, 12, 12), fleshMat);
        gullet.position.set(0, -0.05, 0.95);
        g.add(gullet);

        // Hinged Upper & Lower Jaws ringed with 14 curved ivory fangs
        const upperJaw = new THREE.Group();
        upperJaw.position.set(0, 0.15, 0.85);
        const uPlate = new THREE.Mesh(new THREE.ConeGeometry(0.78, 1.35, 10), boneMat);
        uPlate.rotation.x = Math.PI / 2;
        uPlate.scale.set(1.0, 0.55, 1.0);
        uPlate.position.z = 0.55;
        upperJaw.add(uPlate);

        const lowerJaw = new THREE.Group();
        lowerJaw.position.set(0, -0.22, 0.8);
        const lPlate = new THREE.Mesh(new THREE.ConeGeometry(0.72, 1.3, 10), boneMat);
        lPlate.rotation.x = Math.PI / 2;
        lPlate.scale.set(0.95, 0.5, 1.0);
        lPlate.position.z = 0.52;
        lowerJaw.add(lPlate);

        for (let f = 0; f < 7; f++) {
          const ang = ((f / 6) - 0.5) * Math.PI * 0.85;
          const uTooth = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.38, 6), toothMat);
          uTooth.position.set(Math.sin(ang) * 0.58, -0.18, 0.45 + Math.cos(ang) * 0.65);
          uTooth.rotation.x = Math.PI * 0.88;
          upperJaw.add(uTooth);

          const lTooth = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.35, 6), toothMat);
          lTooth.position.set(Math.sin(ang) * 0.52, 0.18, 0.42 + Math.cos(ang) * 0.6);
          lTooth.rotation.x = -Math.PI * 0.12;
          lowerJaw.add(lTooth);
        }
        g.add(upperJaw, lowerJaw);
        anim.jaws = [upperJaw, lowerJaw];

        // 3 pairs of feathered acoustic gill frill fans behind skull
        anim.frills = [];
        for (let pair = 0; pair < 3; pair++) {
          for (const side of [-1, 1]) {
            const fanGroup = new THREE.Group();
            fanGroup.position.set(side * (0.82 - pair * 0.06), 0.08, -0.15 - pair * 0.38);
            fanGroup.rotation.y = side * (0.55 + pair * 0.12);

            const web = new THREE.Mesh(
              new THREE.CircleGeometry(0.95 - pair * 0.12, 8, -Math.PI * 0.42, Math.PI * 0.84),
              frillMat
            );
            if (side < 0) web.rotation.y = Math.PI;
            fanGroup.add(web);

            for (let r = -2; r <= 2; r++) {
              const spineRay = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.01, 1.05, 5), boneMat);
              spineRay.rotation.z = side * (-Math.PI / 2 + r * 0.22);
              spineRay.position.x = side * 0.45;
              spineRay.position.y = r * 0.15;
              fanGroup.add(spineRay);
            }
            anim.frills.push(fanGroup);
            g.add(fanGroup);
          }
        }

        // 10-segment serpentine spine with dorsal spikes, fin membrane & lateral-line acoustic pores
        anim.spine = [];
        const finWebMat = new THREE.MeshStandardMaterial({
          color: 0x9f1239,
          emissive: 0x4c0519,
          emissiveIntensity: 0.4,
          transparent: true,
          opacity: 0.72,
          side: THREE.DoubleSide,
        });
        for (let s = 1; s <= 10; s++) {
          const segGroup = new THREE.Group();
          const rad = Math.max(0.18, 0.92 - s * 0.075);
          segGroup.position.z = -s * 0.95;

          const vertebra = new THREE.Mesh(new THREE.SphereGeometry(rad, 12, 10), boneMat);
          vertebra.scale.set(0.92, 1.05, 1.25);
          segGroup.add(vertebra);

          // Dorsal spine ridge + fin webbing
          const spike = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.22, rad * 1.15, 6), boneMat);
          spike.position.set(0, rad * 1.2, -0.1);
          spike.rotation.x = -0.35;
          segGroup.add(spike);

          const dorsalFin = new THREE.Mesh(new THREE.PlaneGeometry(0.08, rad * 1.5), finWebMat);
          dorsalFin.rotation.y = Math.PI / 2;
          dorsalFin.position.set(0, rad * 1.0, -0.35);
          segGroup.add(dorsalFin);

          // Glowing lateral-line acoustic receptor pores
          for (const side of [-1, 1]) {
            const pore = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), poreMat);
            pore.position.set(side * rad * 0.9, 0, 0);
            segGroup.add(pore);
          }

          // Broad tail fluke on final segment
          if (s === 10) {
            const fluke = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 1.65), finWebMat);
            fluke.rotation.y = Math.PI / 2;
            fluke.position.set(0, 0, -0.7);
            fluke.scale.set(1, 1, 2.2);
            segGroup.add(fluke);
          }

          anim.spine.push(segGroup);
          g.add(segGroup);
        }
        break;
      }

      // -------------------------------------------------------------------------
      // 2. PHOTOVORE ANGLER-RAY: 6 slit-pupil golden eyes, needle-fanged jaw,
      //    articulated dual-joint manta wings, tendril lantern esca & barbed tail
      // -------------------------------------------------------------------------
      case 'photovore': {
        name = 'Photovore Angler-Ray';
        maxHp = 65 * hpMult;
        baseSpeed = 10.6;
        hitRadius = 2.9;

        const skinMat = new THREE.MeshStandardMaterial({
          color: 0x1e2b45,
          emissive: 0x172554,
          emissiveIntensity: 0.35,
          roughness: 0.38,
          metalness: 0.2,
        });
        const wingMembraneMat = new THREE.MeshStandardMaterial({
          color: 0x293d61,
          emissive: 0x854d0e,
          emissiveIntensity: 0.5,
          roughness: 0.4,
          side: THREE.DoubleSide,
        });
        const goldGlowMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
        const haloMat = new THREE.MeshBasicMaterial({
          color: 0xfacc15,
          transparent: true,
          opacity: 0.32,
        });
        const fangMat = new THREE.MeshPhysicalMaterial({
          color: 0xfefce8,
          roughness: 0.15,
          transparent: true,
          opacity: 0.88,
        });

        // Hunched bulbous angler body + dorsal spines
        const torso = new THREE.Mesh(new THREE.SphereGeometry(1.22, 18, 16), skinMat);
        torso.scale.set(1.18, 0.95, 1.48);
        g.add(torso);

        for (let sp = 0; sp < 4; sp++) {
          const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.65, 6), skinMat);
          horn.position.set(0, 1.05 - sp * 0.12, 0.2 - sp * 0.45);
          horn.rotation.x = -0.45;
          g.add(horn);
        }

        // Protruding underbite angler jaw packed with 12 needle-fangs
        const jawGroup = new THREE.Group();
        jawGroup.position.set(0, -0.35, 0.85);
        const jawBone = new THREE.Mesh(
          new THREE.TorusGeometry(0.78, 0.16, 10, 18, Math.PI * 1.15),
          skinMat
        );
        jawBone.rotation.x = Math.PI * 0.55;
        jawBone.rotation.z = -0.22;
        jawGroup.add(jawBone);

        for (let t = 0; t < 12; t++) {
          const a = ((t / 11) - 0.5) * Math.PI * 0.95;
          const fangLen = t % 2 === 0 ? 0.52 : 0.34;
          const fang = new THREE.Mesh(new THREE.ConeGeometry(0.045, fangLen, 6), fangMat);
          fang.position.set(Math.sin(a) * 0.74, 0.22, Math.cos(a) * 0.74);
          fang.rotation.x = -0.22;
          jawGroup.add(fang);
        }
        g.add(jawGroup);
        anim.jaws = [jawGroup];

        // 6 Reflective Golden Eyes with vertical slit pupils!
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x090400 });
        const eyeSpecs = [
          { x: 0.58, y: 0.34, z: 1.25, r: 0.29 },
          { x: 0.88, y: 0.16, z: 0.92, r: 0.19 },
          { x: 0.42, y: 0.62, z: 1.02, r: 0.14 },
        ];
        for (const side of [-1, 1]) {
          for (const es of eyeSpecs) {
            const eyeBall = new THREE.Mesh(new THREE.SphereGeometry(es.r, 12, 12), goldGlowMat);
            eyeBall.position.set(side * es.x, es.y, es.z);
            const pupil = new THREE.Mesh(new THREE.BoxGeometry(es.r * 0.28, es.r * 1.55, es.r * 0.5), pupilMat);
            pupil.position.z = es.r * 0.82;
            eyeBall.add(pupil);
            g.add(eyeBall);
          }
        }

        // Arching segmented illicium rod + glowing lantern esca with filaments
        const rod1 = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 1.25, 8), skinMat);
        rod1.position.set(0, 1.15, 0.95);
        rod1.rotation.x = 0.52;
        const rod2 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 1.1, 8), skinMat);
        rod2.position.set(0, 1.65, 1.68);
        rod2.rotation.x = 1.15;
        g.add(rod1, rod2);

        const lureGroup = new THREE.Group();
        lureGroup.position.set(0, 1.55, 2.28);
        const escaCore = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 14), goldGlowMat);
        const escaHalo = new THREE.Mesh(new THREE.SphereGeometry(0.56, 14, 14), haloMat);
        lureGroup.add(escaCore, escaHalo);
        for (let fil = 0; fil < 4; fil++) {
          const tendril = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.005, 0.65, 5), goldGlowMat);
          tendril.position.set(Math.cos(fil * 1.57) * 0.18, -0.35, Math.sin(fil * 1.57) * 0.18);
          lureGroup.add(tendril);
        }
        g.add(lureGroup);
        anim.lure = lureGroup;

        // Articulated 2-stage Manta Wings with glowing bioluminescent spots
        anim.wings = [];
        for (const side of [-1, 1]) {
          const innerWing = new THREE.Group();
          innerWing.position.set(side * 0.95, 0.0, 0.05);

          const innerMesh = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.12, 2.1), wingMembraneMat);
          innerMesh.position.set(side * 0.75, 0, -0.1);
          innerMesh.rotation.y = -side * 0.18;
          innerWing.add(innerMesh);

          // Glowing golden wing spots
          for (let sp = 0; sp < 3; sp++) {
            const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), goldGlowMat);
            dot.position.set(side * (0.45 + sp * 0.35), 0.07, 0.3 - sp * 0.45);
            innerWing.add(dot);
          }

          const outerWing = new THREE.Group();
          outerWing.position.set(side * 1.45, 0, -0.15);
          const outerShape = new THREE.ConeGeometry(0.95, 1.85, 4);
          outerShape.rotateZ(-side * Math.PI * 0.5);
          outerShape.scale(1.0, 0.12, 1.35);
          const outerMesh = new THREE.Mesh(outerShape, wingMembraneMat);
          outerMesh.position.set(side * 0.78, 0, -0.25);
          outerWing.add(outerMesh);

          innerWing.add(outerWing);
          g.add(innerWing);
          anim.wings.push({ inner: innerWing, outer: outerWing, side });
        }

        // Barbed whip tail
        const whipTail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 3.2, 8), skinMat);
        whipTail.rotation.x = -Math.PI / 2;
        whipTail.position.set(0, -0.05, -2.6);
        g.add(whipTail);
        break;
      }

      // -------------------------------------------------------------------------
      // 3. VOID SHADOW KRAKEN: Ribbed mantle with glowing violet veins, apex fins,
      //    central beak, 4 slit eyes & 8 multi-jointed sucker-lined tentacles
      // -------------------------------------------------------------------------
      case 'shadow_kraken': {
        name = 'Void Shadow Kraken';
        maxHp = 85 * hpMult;
        baseSpeed = 10.2;
        hitRadius = 3.0;

        const mantleMat = new THREE.MeshStandardMaterial({
          color: 0x130924,
          emissive: 0x2e1065,
          emissiveIntensity: 0.55,
          roughness: 0.48,
          metalness: 0.22,
        });
        const veinMat = new THREE.MeshBasicMaterial({ color: 0xa855f7 });
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xe879f9 });
        const suckerMat = new THREE.MeshStandardMaterial({
          color: 0xd8b4fe,
          emissive: 0x7e22ce,
          emissiveIntensity: 0.45,
          roughness: 0.4,
        });

        // Muscular tapered cephalopod mantle + collar rim
        const mantle = new THREE.Mesh(new THREE.ConeGeometry(1.48, 3.9, 16), mantleMat);
        mantle.rotation.x = -Math.PI / 2;
        mantle.position.z = -1.55;
        g.add(mantle);

        const collar = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.22, 10, 20), mantleMat);
        collar.position.z = 0.25;
        g.add(collar);

        // Glowing violet bioluminescent vein strips along mantle
        for (let v = 0; v < 6; v++) {
          const a = (v / 6) * Math.PI * 2;
          const vein = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.015, 3.3, 6), veinMat);
          vein.rotation.x = Math.PI / 2;
          vein.position.set(Math.cos(a) * 0.92, Math.sin(a) * 0.92, -1.3);
          vein.rotation.y = -Math.cos(a) * 0.28;
          g.add(vein);
        }

        // Apex mantle stabilizing fins
        anim.fins = [];
        for (const side of [-1, 1]) {
          const fin = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.6, 4), mantleMat);
          fin.scale.set(1.0, 0.14, 1.3);
          fin.rotation.z = -side * Math.PI * 0.5;
          fin.position.set(side * 0.72, 0.1, -2.75);
          anim.fins.push(fin);
          g.add(fin);
        }

        // Head bulb + 4 eerie violet slit eyes + chitin beak
        const headBulb = new THREE.Mesh(new THREE.SphereGeometry(1.12, 14, 14), mantleMat);
        headBulb.position.z = 0.65;
        g.add(headBulb);

        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x05010a });
        for (const side of [-1, 1]) {
          for (const tier of [0, 1]) {
            const r = tier === 0 ? 0.28 : 0.18;
            const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), eyeMat);
            eye.position.set(side * (0.78 - tier * 0.15), 0.25 - tier * 0.45, 0.85 + tier * 0.2);
            const slit = new THREE.Mesh(new THREE.BoxGeometry(r * 0.26, r * 1.6, r * 0.5), pupilMat);
            slit.position.z = r * 0.8;
            eye.add(slit);
            g.add(eye);
          }
        }

        // Sharp dark beak in center of tentacle ring
        const beak = new THREE.Mesh(
          new THREE.ConeGeometry(0.35, 0.75, 8),
          new THREE.MeshStandardMaterial({ color: 0x09040f, roughness: 0.2, metalness: 0.6 })
        );
        beak.rotation.x = Math.PI / 2;
        beak.position.z = 1.55;
        g.add(beak);

        // 8 Articulated 3-Joint Tentacles with inner rows of glowing suckers!
        anim.tentacleChains = [];
        for (let t = 0; t < 8; t++) {
          const ang = (t / 8) * Math.PI * 2;
          const chain: THREE.Object3D[] = [];

          const rootPivot = new THREE.Group();
          rootPivot.position.set(Math.cos(ang) * 0.82, Math.sin(ang) * 0.82, 1.15);
          rootPivot.rotation.z = ang;

          let parent: THREE.Object3D = rootPivot;
          const segLengths = [1.25, 1.15, 1.05];
          const segRadii = [0.22, 0.15, 0.08];

          for (let s = 0; s < 3; s++) {
            const joint = new THREE.Group();
            if (s > 0) joint.position.z = segLengths[s - 1] * 0.92;

            const limb = new THREE.Mesh(
              new THREE.CylinderGeometry(segRadii[s] * 0.68, segRadii[s], segLengths[s], 8),
              mantleMat
            );
            limb.rotation.x = Math.PI / 2;
            limb.position.z = segLengths[s] * 0.5;
            joint.add(limb);

            // Suckers facing inward toward center
            for (let sk = 0; sk < 2; sk++) {
              const sucker = new THREE.Mesh(
                new THREE.CylinderGeometry(segRadii[s] * 0.48, segRadii[s] * 0.48, 0.06, 8),
                suckerMat
              );
              sucker.position.set(-segRadii[s] * 0.72, 0, segLengths[s] * (0.3 + sk * 0.42));
              sucker.rotation.z = Math.PI / 2;
              joint.add(sucker);
            }

            parent.add(joint);
            chain.push(joint);
            parent = joint;
          }

          anim.tentacleChains.push(chain);
          g.add(rootPivot);
        }
        break;
      }

      // -------------------------------------------------------------------------
      // 4. CRUSHER LEVIATHAN: Layered obsidian-bronze chitin plates, magma seams,
      //    furnace maw with 4 mandibles, 6 swimming legs & 2 articulated pincer claws
      // -------------------------------------------------------------------------
      case 'crusher': {
        name = 'Crusher Leviathan';
        maxHp = 135 * hpMult;
        baseSpeed = 7.6;
        hitRadius = 3.6;
        armorAgainstBullets = 0.15;
        harpoonMultiplier = 2.4;

        const chitinMat = new THREE.MeshStandardMaterial({
          color: 0x3b261d,
          metalness: 0.55,
          roughness: 0.34,
          flatShading: true,
        });
        const darkPlateMat = new THREE.MeshStandardMaterial({
          color: 0x241712,
          metalness: 0.62,
          roughness: 0.3,
          flatShading: true,
        });
        const magmaMat = new THREE.MeshBasicMaterial({ color: 0xff6b1a });
        const hornMat = new THREE.MeshStandardMaterial({
          color: 0x78350f,
          roughness: 0.35,
          metalness: 0.4,
        });

        // Inner magma core body (glows through gaps in overlapping armor plates!)
        const underBody = new THREE.Mesh(new THREE.SphereGeometry(1.85, 14, 12), magmaMat);
        underBody.scale.set(1.25, 0.88, 1.55);
        g.add(underBody);

        // 5 Overlapping Heavy Chitin Dorsal Carapace Plates + Dorsal Horns
        for (let p = 0; p < 5; p++) {
          const zOff = 1.4 - p * 0.88;
          const scaleW = 1.0 - Math.abs(p - 1.5) * 0.12;
          const plate = new THREE.Mesh(
            new THREE.CylinderGeometry(2.05 * scaleW, 2.25 * scaleW, 0.78, 8, 1, false, 0, Math.PI * 1.35),
            p % 2 === 0 ? chitinMat : darkPlateMat
          );
          plate.rotation.z = Math.PI * 0.825;
          plate.rotation.x = Math.PI / 2 + 0.14;
          plate.position.set(0, 0.12, zOff);
          g.add(plate);

          // Jagged dorsal ridge horns
          for (const side of [-1, 0, 1]) {
            const horn = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.95, 5), hornMat);
            horn.position.set(side * 0.95 * scaleW, 1.65 * scaleW, zOff);
            horn.rotation.z = -side * 0.38;
            horn.rotation.x = -0.35;
            g.add(horn);
          }
        }

        // armored ventral plastron belly
        const belly = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.55, 4.2), darkPlateMat);
        belly.position.set(0, -1.05, -0.2);
        g.add(belly);

        // Blazing furnace maw + 4 serrated mandibles + 4 stalk-eyes
        const mawRing = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.24, 8, 14), darkPlateMat);
        mawRing.position.set(0, -0.15, 2.35);
        g.add(mawRing);

        for (const sx of [-0.85, -0.45, 0.45, 0.85]) {
          const eyeStalk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.55, 6), chitinMat);
          eyeStalk.position.set(sx, 0.72, 2.15);
          eyeStalk.rotation.x = 0.45;
          const eyeBead = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), magmaMat);
          eyeBead.position.y = 0.3;
          eyeStalk.add(eyeBead);
          g.add(eyeStalk);
        }

        // 2 Colossal Articulated Siege Pincer Claws!
        anim.claws = [];
        for (const side of [-1, 1]) {
          const armPivot = new THREE.Group();
          armPivot.position.set(side * 1.95, -0.25, 1.15);
          armPivot.rotation.y = -side * 0.32;

          const shoulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 0), chitinMat);
          const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.72, 1.65), darkPlateMat);
          forearm.position.set(side * 0.2, 0, 0.95);

          // Upper fixed crusher jaw
          const upperClaw = new THREE.Mesh(new THREE.ConeGeometry(0.46, 1.75, 6), chitinMat);
          upperClaw.rotation.x = Math.PI / 2;
          upperClaw.position.set(side * 0.15, 0.24, 2.35);

          // Hinged lower snapping pincer
          const lowerPincerPivot = new THREE.Group();
          lowerPincerPivot.position.set(side * 0.15, -0.18, 1.65);
          const lowerClaw = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.55, 6), hornMat);
          lowerClaw.rotation.x = Math.PI / 2;
          lowerClaw.position.z = 0.72;
          lowerPincerPivot.add(lowerClaw);

          armPivot.add(shoulder, forearm, upperClaw, lowerPincerPivot);
          g.add(armPivot);
          anim.claws.push({ arm: armPivot, pincer: lowerPincerPivot, side });
        }

        // 6 Jointed Swimming Pleopod Legs rowing beneath carapace
        anim.legs = [];
        for (let l = 0; l < 3; l++) {
          for (const side of [-1, 1]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.15, 0.36), chitinMat);
            leg.position.set(side * 1.75, -1.15, 0.2 - l * 1.05);
            leg.rotation.z = side * 0.55;
            anim.legs.push(leg);
            g.add(leg);
          }
        }
        break;
      }

      // -------------------------------------------------------------------------
      // 5. RAZOR VIPER SWARM: 9 detailed Sloan's Viperfish with saber-fangs,
      //    glowing belly photophores, dorsal ray filament & beating forked tails
      // -------------------------------------------------------------------------
      case 'razor_swarm': {
        name = 'Razor Viper Swarm';
        maxHp = 46 * hpMult;
        baseSpeed = 13.5;
        hitRadius = 2.8;
        harpoonMultiplier = 0.85;
        armorAgainstBullets = 1.45;

        const scaleMat = new THREE.MeshStandardMaterial({
          color: 0x10b981,
          emissive: 0x064e3b,
          emissiveIntensity: 0.55,
          metalness: 0.55,
          roughness: 0.28,
        });
        const finMat = new THREE.MeshBasicMaterial({
          color: 0x34d399,
          transparent: true,
          opacity: 0.78,
          side: THREE.DoubleSide,
        });
        const fangMat = new THREE.MeshBasicMaterial({ color: 0xecfdf5 });
        const photoMat = new THREE.MeshBasicMaterial({ color: 0xa7f3d0 });

        anim.swarmFish = [];
        for (let f = 0; f < 9; f++) {
          const fish = new THREE.Group();
          const baseOffset = new THREE.Vector3(
            (Math.random() - 0.5) * 3.1,
            (Math.random() - 0.5) * 2.2,
            (Math.random() - 0.5) * 2.6
          );
          fish.position.copy(baseOffset);

          // Sleek viperfish body
          const body = new THREE.Mesh(new THREE.ConeGeometry(0.24, 1.55, 10), scaleMat);
          body.rotation.x = -Math.PI / 2;
          body.scale.set(0.75, 1.1, 1.0);
          fish.add(body);

          const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), scaleMat);
          head.scale.set(0.8, 1.05, 1.25);
          head.position.z = 0.72;
          fish.add(head);

          // Fierce glowing yellow-green eyes
          for (const side of [-1, 1]) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), photoMat);
            eye.position.set(side * 0.16, 0.08, 0.88);
            fish.add(eye);
          }

          // Hinged lower jaw with oversized curved saber-fangs!
          const jaw = new THREE.Group();
          jaw.position.set(0, -0.1, 0.75);
          const jawBar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.42), scaleMat);
          jawBar.position.z = 0.18;
          jaw.add(jawBar);
          for (const side of [-1, 1]) {
            const saber = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.34, 5), fangMat);
            saber.position.set(side * 0.08, 0.16, 0.36);
            saber.rotation.x = -0.15;
            jaw.add(saber);
          }
          fish.add(jaw);

          // Belly bioluminescent photophore row + tall dorsal spine filament
          for (let p = 0; p < 4; p++) {
            const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), photoMat);
            dot.position.set(0, -0.22 + p * 0.03, 0.45 - p * 0.28);
            fish.add(dot);
          }
          const dorsalRay = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.025, 0.75, 5), finMat);
          dorsalRay.position.set(0, 0.45, 0.25);
          dorsalRay.rotation.x = -0.55;
          fish.add(dorsalRay);

          // Forked caudal tail fin
          const tailPivot = new THREE.Group();
          tailPivot.position.z = -0.75;
          for (const vSign of [-1, 1]) {
            const lobe = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.48, 4), finMat);
            lobe.scale.set(0.25, 1.0, 1.0);
            lobe.position.set(0, vSign * 0.16, -0.18);
            lobe.rotation.x = -Math.PI / 2 + vSign * 0.52;
            tailPivot.add(lobe);
          }
          fish.add(tailPivot);

          anim.swarmFish.push({ root: fish, tail: tailPivot, jaw, baseOffset });
          g.add(fish);
        }
        break;
      }

      // -------------------------------------------------------------------------
      // 6. VOLT EMP SIPHONOPHORE: Ribbed translucent medusa bell, bio-reactor core,
      //    2 counter-rotating plasma arc rings, oral arms & 10 beaded tentacles
      // -------------------------------------------------------------------------
      case 'volt_jelly': {
        name = 'Volt EMP Siphonophore';
        maxHp = 58 * hpMult;
        baseSpeed = 9.0;
        hitRadius = 2.7;

        const bellMat = new THREE.MeshPhysicalMaterial({
          color: 0x0891b2,
          emissive: 0x06b6d4,
          emissiveIntensity: 0.72,
          transparent: true,
          opacity: 0.68,
          roughness: 0.12,
          side: THREE.DoubleSide,
        });
        const coreMat = new THREE.MeshBasicMaterial({ color: 0xa5f3fc });
        const neonArcMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });

        const bellGroup = new THREE.Group();
        const outerDome = new THREE.Mesh(
          new THREE.SphereGeometry(1.65, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62),
          bellMat
        );
        outerDome.rotation.x = Math.PI / 2;
        bellGroup.add(outerDome);

        // Glowing meridian ribs & scalloped marginal nodes around bell rim
        for (let r = 0; r < 10; r++) {
          const ang = (r / 10) * Math.PI * 2;
          const lappet = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), coreMat);
          lappet.position.set(Math.cos(ang) * 1.52, Math.sin(ang) * 1.52, -0.55);
          bellGroup.add(lappet);
        }

        // Pulsing inner bio-electric plasma nucleus
        const nucleus = new THREE.Mesh(new THREE.OctahedronGeometry(0.68, 1), coreMat);
        nucleus.position.z = 0.35;
        bellGroup.add(nucleus);
        g.add(bellGroup);
        anim.bell = bellGroup;

        // 2 Counter-Rotating Electric Arc Rings
        const ring1 = new THREE.Mesh(new THREE.TorusGeometry(1.92, 0.055, 8, 28), neonArcMat);
        ring1.rotation.x = 0.35;
        const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.12, 0.04, 8, 28), coreMat);
        ring2.rotation.y = 0.45;
        g.add(ring1, ring2);
        anim.arcRings = [ring1, ring2];

        // 10 Articulated Trailing Tentacles studded with glowing nematocyst beads
        anim.tentacleChains = [];
        for (let t = 0; t < 10; t++) {
          const ang = (t / 10) * Math.PI * 2;
          const rad = t % 2 === 0 ? 1.15 : 0.55;
          const root = new THREE.Group();
          root.position.set(Math.cos(ang) * rad, Math.sin(ang) * rad, -0.5);

          const chain: THREE.Object3D[] = [];
          let parent: THREE.Object3D = root;
          for (let s = 0; s < 3; s++) {
            const seg = new THREE.Group();
            if (s > 0) seg.position.z = -1.15;

            const strand = new THREE.Mesh(
              new THREE.CylinderGeometry(0.045 - s * 0.01, 0.035 - s * 0.008, 1.2, 6),
              neonArcMat
            );
            strand.rotation.x = Math.PI / 2;
            strand.position.z = -0.6;
            seg.add(strand);

            const bead = new THREE.Mesh(new THREE.SphereGeometry(0.09 - s * 0.015, 8, 8), coreMat);
            bead.position.z = -1.1;
            seg.add(bead);

            parent.add(seg);
            chain.push(seg);
            parent = seg;
          }
          anim.tentacleChains.push(chain);
          g.add(root);
        }
        break;
      }

      // -------------------------------------------------------------------------
      // 7. MIMIC LANTERN-SIREN: Sleek abyssal shark-eel with fins, blooming lotus
      //    decoy lure & 3-way split petal jaws packed with neon-crimson fangs!
      // -------------------------------------------------------------------------
      case 'mimic_siren': {
        name = 'Mimic Lantern-Siren';
        maxHp = 68 * hpMult;
        baseSpeed = 11.0;
        hitRadius = 2.6;

        const hideMat = new THREE.MeshStandardMaterial({
          color: 0x1e162b,
          roughness: 0.55,
          metalness: 0.25,
        });
        const innerMawMat = new THREE.MeshStandardMaterial({
          color: 0x9f1239,
          emissive: 0xe11d48,
          emissiveIntensity: 0.75,
          roughness: 0.35,
          side: THREE.DoubleSide,
        });
        const lurePinkMat = new THREE.MeshBasicMaterial({ color: 0xf472b6 });
        const lureCyanMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9 });
        const fangMat = new THREE.MeshBasicMaterial({ color: 0xffe4e6 });

        // Sleek muscular shark-eel body + dorsal fin + pectoral fins + tail
        const torso = new THREE.Mesh(new THREE.SphereGeometry(1.18, 16, 14), hideMat);
        torso.scale.set(0.95, 0.92, 1.85);
        torso.position.z = -0.55;
        g.add(torso);

        const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.82, 2.6, 12), hideMat);
        tailCone.rotation.x = -Math.PI / 2;
        tailCone.position.z = -2.65;
        g.add(tailCone);

        const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.25, 4), hideMat);
        dorsal.scale.set(0.22, 1, 1.4);
        dorsal.position.set(0, 1.25, -0.8);
        dorsal.rotation.x = -0.45;
        g.add(dorsal);

        for (const side of [-1, 1]) {
          const pec = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.45, 4), hideMat);
          pec.scale.set(1.0, 0.15, 1.2);
          pec.rotation.z = -side * Math.PI * 0.42;
          pec.position.set(side * 1.25, -0.35, -0.3);
          g.add(pec);
        }

        // Deceptive pretty glowing lotus-blossom orb dangling far out front!
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.9, 6), hideMat);
        stalk.position.set(0, 0.68, 1.55);
        stalk.rotation.x = 1.05;
        g.add(stalk);

        const lureGroup = new THREE.Group();
        lureGroup.position.set(0, 1.15, 2.55);
        const centerGem = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), lureCyanMat);
        const pinkHalo = new THREE.Mesh(
          new THREE.SphereGeometry(0.56, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0xf472b6, transparent: true, opacity: 0.42 })
        );
        lureGroup.add(centerGem, pinkHalo);
        for (let p = 0; p < 6; p++) {
          const a = (p / 6) * Math.PI * 2;
          const petal = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 6), lurePinkMat);
          petal.position.set(Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0);
          petal.rotation.z = a - Math.PI / 2;
          lureGroup.add(petal);
        }
        g.add(lureGroup);
        anim.lure = lureGroup;

        // Glowing hypnotic gullet + 3-Way Split Petal Jaws packed with fangs!
        const throat = new THREE.Mesh(new THREE.SphereGeometry(0.68, 12, 12), innerMawMat);
        throat.position.z = 0.72;
        g.add(throat);

        anim.petalJaws = [];
        for (let j = 0; j < 3; j++) {
          const ang = (j / 3) * Math.PI * 2 + Math.PI / 2;
          const jawRoot = new THREE.Group();
          jawRoot.position.set(Math.cos(ang) * 0.55, Math.sin(ang) * 0.55, 0.75);
          jawRoot.rotation.z = ang - Math.PI / 2;

          const outerLobe = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.45, 7), hideMat);
          outerLobe.rotation.x = Math.PI / 2;
          outerLobe.scale.set(1.05, 0.38, 1.0);
          outerLobe.position.z = 0.68;
          jawRoot.add(outerLobe);

          const innerFlesh = new THREE.Mesh(new THREE.ConeGeometry(0.52, 1.32, 7), innerMawMat);
          innerFlesh.rotation.x = Math.PI / 2;
          innerFlesh.scale.set(0.95, 0.25, 1.0);
          innerFlesh.position.set(0, -0.06, 0.66);
          jawRoot.add(innerFlesh);

          // Double row of razor fangs along each petal lobe!
          for (let f = -2; f <= 2; f++) {
            const fang = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.34, 5), fangMat);
            fang.position.set(f * 0.16, -0.18, 0.55 + (2 - Math.abs(f)) * 0.22);
            fang.rotation.x = Math.PI;
            jawRoot.add(fang);
          }

          anim.petalJaws.push(jawRoot);
          g.add(jawRoot);
        }
        break;
      }
    }

    // Record base emissive values so hit-flash and sonar-ping cleanly restore bioluminescence
    tagMaterialBaseEmissive(g);

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
      anim,
    };
  }

  private animateMonster(m: MonsterInstance, time: number): void {
    const t = time * 4 + m.animSeed;
    const a = m.anim;

    switch (m.type) {
      case 'blind_stalker': {
        // Snap jaws & flare acoustic gill fans when agitated by motor noise
        if (a.jaws && a.jaws.length === 2) {
          const bite = m.agitated ? 0.28 + 0.16 * Math.sin(t * 2.6) : 0.05;
          a.jaws[0].rotation.x = -bite;
          a.jaws[1].rotation.x = bite;
        }
        if (a.frills) {
          a.frills.forEach((fan, idx) => {
            const side = idx % 2 === 0 ? -1 : 1;
            const flare = m.agitated ? 1.15 + 0.22 * Math.sin(t * 3 + idx) : 0.55;
            fan.scale.setScalar(flare);
            fan.rotation.y = side * (m.agitated ? 0.88 : 0.32);
            fan.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
                if (mat.isMeshBasicMaterial && mat.transparent) {
                  mat.color.setHex(m.agitated ? 0xff2a4b : 0x38bdf8);
                }
              }
            });
          });
        }
        if (a.spine) {
          a.spine.forEach((seg, idx) => {
            seg.position.x = Math.sin(t * 1.8 - idx * 0.62) * (0.28 + idx * 0.065);
            seg.position.y = Math.cos(t * 1.4 - idx * 0.5) * 0.14;
            seg.rotation.y = Math.cos(t * 1.8 - idx * 0.62) * 0.26;
          });
        }
        break;
      }

      case 'photovore': {
        if (a.lure) {
          a.lure.scale.setScalar(0.92 + 0.24 * Math.sin(t * 2.2));
          a.lure.position.x = Math.sin(t * 1.3) * 0.25;
        }
        if (a.jaws && a.jaws[0]) {
          a.jaws[0].rotation.x = 0.15 + 0.14 * Math.sin(t * 1.9);
        }
        if (a.wings) {
          for (const w of a.wings) {
            const flap = Math.sin(t * 1.45);
            w.inner.rotation.z = w.side * flap * 0.36;
            w.outer.rotation.z = w.side * Math.sin(t * 1.45 - 0.65) * 0.44;
          }
        }
        break;
      }

      case 'shadow_kraken': {
        if (a.fins) {
          a.fins.forEach((fin, idx) => {
            const side = idx === 0 ? -1 : 1;
            fin.rotation.y = side * Math.sin(t * 1.8) * 0.32;
          });
        }
        if (a.tentacleChains) {
          a.tentacleChains.forEach((chain, tIdx) => {
            chain.forEach((joint, sIdx) => {
              const wave = Math.sin(t * 1.65 + tIdx * 0.8 + sIdx * 0.95);
              joint.rotation.y = (0.18 + wave * 0.28) * (m.agitated ? 1.15 : 0.55);
              joint.rotation.x = Math.cos(t * 1.3 + tIdx + sIdx) * 0.14;
            });
          });
        }
        break;
      }

      case 'crusher': {
        if (a.claws) {
          for (const c of a.claws) {
            c.arm.rotation.y = -c.side * (0.28 + 0.14 * Math.sin(t * 1.2));
            c.pincer.rotation.x = 0.22 + 0.2 * Math.sin(t * 2.4);
          }
        }
        if (a.legs) {
          a.legs.forEach((leg, idx) => {
            leg.rotation.x = Math.sin(t * 2.2 + idx * 0.9) * 0.42;
          });
        }
        break;
      }

      case 'razor_swarm': {
        if (a.swarmFish) {
          a.swarmFish.forEach((f, idx) => {
            f.root.position.x = f.baseOffset.x + Math.cos(t * 1.7 + idx * 1.1) * 0.85;
            f.root.position.y = f.baseOffset.y + Math.sin(t * 2.0 + idx * 1.3) * 0.65;
            f.tail.rotation.y = Math.sin(t * 4.8 + idx) * 0.52;
            f.jaw.rotation.x = 0.18 + 0.14 * Math.abs(Math.sin(t * 2.5 + idx));
          });
        }
        break;
      }

      case 'volt_jelly': {
        if (a.bell) {
          const pulse = Math.sin(t * 1.25);
          const xy = 0.92 + 0.16 * pulse;
          a.bell.scale.set(xy, xy, 1.12 - 0.14 * pulse);
        }
        if (a.arcRings) {
          a.arcRings[0].rotation.z += 0.05;
          a.arcRings[0].rotation.y += 0.025;
          a.arcRings[1].rotation.z -= 0.04;
          a.arcRings[1].rotation.x += 0.03;
        }
        if (a.tentacleChains) {
          a.tentacleChains.forEach((chain, tIdx) => {
            chain.forEach((seg, sIdx) => {
              seg.rotation.x = Math.sin(t * 1.35 + tIdx * 0.7 - sIdx * 0.8) * 0.24;
              seg.rotation.y = Math.cos(t * 1.15 + tIdx * 0.5 - sIdx * 0.8) * 0.24;
            });
          });
        }
        break;
      }

      case 'mimic_siren': {
        if (a.lure) {
          a.lure.rotation.z += 0.035;
          a.lure.scale.setScalar(0.95 + 0.15 * Math.sin(t * 1.8));
        }
        if (a.petalJaws) {
          // Stay tightly shut in disguise when calm; bloom wide open when lunging!
          const openAngle = m.agitated ? 0.68 + 0.12 * Math.sin(t * 3.2) : -0.18;
          for (const pj of a.petalJaws) {
            pj.rotation.x = openAngle;
          }
        }
        break;
      }
    }

    // Apply Hit-Flash or Sonar-Reveal while cleanly restoring every material's base bioluminescence!
    m.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (mat && 'emissive' in mat) {
          if (m.hitFlashTimer > 0) {
            mat.emissive.setHex(0xffffff);
            mat.emissiveIntensity = 1.6;
          } else if (m.sonarRevealTimer > 0) {
            mat.emissive.setHex(0x06b6d4);
            mat.emissiveIntensity = 1.05;
          } else if (mat.userData.baseEmissiveHex !== undefined) {
            mat.emissive.setHex(mat.userData.baseEmissiveHex);
            mat.emissiveIntensity = mat.userData.baseEmissiveIntensity;
          }
        }
      }
    });
  }
}
