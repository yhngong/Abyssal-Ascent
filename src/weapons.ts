import * as THREE from 'three';
import { MonsterInstance, MonsterManager } from './monsters';
import { WeaponType } from './types';

interface Projectile {
  type: WeaponType;
  mesh: THREE.Mesh;
  tetherLine?: THREE.Line;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  damage: number;
}

interface HitBurst {
  points: THREE.Points;
  velocities: Float32Array;
  life: number;
}

export class WeaponSystem {
  public group = new THREE.Group();
  public activeWeapon: WeaponType = 'harpoon';

  public harpoonCooldown = 0;
  public readonly harpoonMaxCooldown = 0.82;

  public bulletAmmo = 50;
  public readonly bulletMaxAmmo = 50;
  public bulletFireCooldown = 0;
  public bulletReloadTimer = 0;
  public readonly bulletReloadDuration = 1.25;

  private projectiles: Projectile[] = [];
  private bursts: HitBurst[] = [];

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  public reset(): void {
    for (const p of this.projectiles) {
      this.group.remove(p.mesh);
      if (p.tetherLine) this.group.remove(p.tetherLine);
    }
    this.projectiles = [];
    for (const b of this.bursts) {
      this.group.remove(b.points);
    }
    this.bursts = [];
    this.activeWeapon = 'harpoon';
    this.harpoonCooldown = 0;
    this.bulletAmmo = this.bulletMaxAmmo;
    this.bulletReloadTimer = 0;
    this.bulletFireCooldown = 0;
  }

  public startReload(): boolean {
    if (this.bulletReloadTimer > 0 || this.bulletAmmo === this.bulletMaxAmmo) return false;
    this.bulletReloadTimer = this.bulletReloadDuration;
    return true;
  }

  public canFire(turretDamaged: boolean): boolean {
    if (this.activeWeapon === 'harpoon') {
      return this.harpoonCooldown <= 0;
    }
    if (this.bulletReloadTimer > 0) return false;
    if (this.bulletAmmo <= 0) {
      this.startReload();
      return false;
    }
    return this.bulletFireCooldown <= 0;
  }

  public fire(
    muzzlePos: THREE.Vector3,
    aimDir: THREE.Vector3,
    turretDamaged: boolean
  ): { fired: boolean; weapon: WeaponType; noiseAdded: number } {
    if (!this.canFire(turretDamaged)) {
      return { fired: false, weapon: this.activeWeapon, noiseAdded: 0 };
    }

    const slowPenalty = turretDamaged ? 1.45 : 1.0;

    if (this.activeWeapon === 'harpoon') {
      this.harpoonCooldown = this.harpoonMaxCooldown * slowPenalty;

      const spearGroupGeo = new THREE.CylinderGeometry(0.055, 0.075, 1.8, 8);
      spearGroupGeo.rotateX(Math.PI / 2);
      const spearMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const mesh = new THREE.Mesh(spearGroupGeo, spearMat);
      mesh.position.copy(muzzlePos);
      mesh.lookAt(muzzlePos.clone().add(aimDir));
      this.group.add(mesh);

      // Tether cable back to submarine harpoon mount
      const lineGeo = new THREE.BufferGeometry().setFromPoints([muzzlePos.clone(), muzzlePos.clone()]);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x7dd3fc,
        transparent: true,
        opacity: 0.65,
      });
      const tetherLine = new THREE.Line(lineGeo, lineMat);
      this.group.add(tetherLine);

      this.projectiles.push({
        type: 'harpoon',
        mesh,
        tetherLine,
        position: muzzlePos.clone(),
        velocity: aimDir.clone().normalize().multiplyScalar(96),
        life: 1.65,
        damage: 76,
      });

      return { fired: true, weapon: 'harpoon', noiseAdded: 0.06 };
    } else {
      this.bulletFireCooldown = 0.095 * slowPenalty;
      this.bulletAmmo--;
      if (this.bulletAmmo <= 0) {
        this.bulletReloadTimer = this.bulletReloadDuration * slowPenalty;
      }

      // Slight spread for rotary cannon
      const spread = aimDir.clone();
      spread.x += (Math.random() - 0.5) * 0.018;
      spread.y += (Math.random() - 0.5) * 0.018;
      spread.normalize();

      const tracerGeo = new THREE.SphereGeometry(0.12, 6, 6);
      tracerGeo.scale(1, 1, 3.8);
      const tracerMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
      const mesh = new THREE.Mesh(tracerGeo, tracerMat);
      mesh.position.copy(muzzlePos);
      mesh.lookAt(muzzlePos.clone().add(spread));
      this.group.add(mesh);

      this.projectiles.push({
        type: 'bullets',
        mesh,
        position: muzzlePos.clone(),
        velocity: spread.multiplyScalar(135),
        life: 1.15,
        damage: 19,
      });

      return { fired: true, weapon: 'bullets', noiseAdded: 0.36 };
    }
  }

  public update(
    dt: number,
    harpoonOrigin: THREE.Vector3,
    monsterMgr: MonsterManager
  ): { hits: number; kills: number; ricochets: number } {
    this.harpoonCooldown = Math.max(0, this.harpoonCooldown - dt);
    this.bulletFireCooldown = Math.max(0, this.bulletFireCooldown - dt);

    if (this.bulletReloadTimer > 0) {
      this.bulletReloadTimer -= dt;
      if (this.bulletReloadTimer <= 0) {
        this.bulletReloadTimer = 0;
        this.bulletAmmo = this.bulletMaxAmmo;
      }
    }

    let hits = 0;
    let kills = 0;
    let ricochets = 0;

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      const step = p.velocity.clone().multiplyScalar(dt);
      const nextPos = p.position.clone().add(step);

      // Check segment-sphere collision against monsters
      let hitMonster: MonsterInstance | null = null;
      for (const m of monsterMgr.monsters) {
        const dist = this.distPointToSegment(m.position, p.position, nextPos);
        if (dist <= m.hitRadius + (p.type === 'harpoon' ? 0.9 : 0.6)) {
          hitMonster = m;
          break;
        }
      }

      p.position.copy(nextPos);
      p.mesh.position.copy(p.position);

      if (p.tetherLine) {
        const posAttr = p.tetherLine.geometry.attributes.position as THREE.BufferAttribute;
        posAttr.setXYZ(0, harpoonOrigin.x, harpoonOrigin.y, harpoonOrigin.z);
        posAttr.setXYZ(1, p.position.x, p.position.y, p.position.z);
        posAttr.needsUpdate = true;
      }

      if (hitMonster) {
        const res = monsterMgr.damageMonster(hitMonster, p.damage, p.type);
        hits++;
        if (res.killed) kills++;
        if (res.ricochet) ricochets++;

        this.spawnHitBurst(
          p.position,
          res.ricochet ? 0x94a3b8 : res.killed ? 0xf87171 : 0x38bdf8,
          res.killed ? 28 : 14
        );

        this.group.remove(p.mesh);
        if (p.tetherLine) this.group.remove(p.tetherLine);
        this.projectiles.splice(i, 1);
        continue;
      }

      if (p.life <= 0) {
        this.group.remove(p.mesh);
        if (p.tetherLine) this.group.remove(p.tetherLine);
        this.projectiles.splice(i, 1);
      }
    }

    // Update particle bursts
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      const arr = b.points.geometry.attributes.position.array as Float32Array;
      const count = arr.length / 3;
      for (let k = 0; k < count; k++) {
        arr[k * 3] += b.velocities[k * 3] * dt;
        arr[k * 3 + 1] += b.velocities[k * 3 + 1] * dt;
        arr[k * 3 + 2] += b.velocities[k * 3 + 2] * dt;
      }
      b.points.geometry.attributes.position.needsUpdate = true;
      (b.points.material as THREE.PointsMaterial).opacity = Math.max(0, b.life * 2);

      if (b.life <= 0) {
        this.group.remove(b.points);
        this.bursts.splice(i, 1);
      }
    }

    return { hits, kills, ricochets };
  }

  private spawnHitBurst(origin: THREE.Vector3, colorHex: number, count: number): void {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = origin.x;
      pos[i * 3 + 1] = origin.y;
      pos[i * 3 + 2] = origin.z;
      vel[i * 3] = (Math.random() - 0.5) * 16;
      vel[i * 3 + 1] = (Math.random() - 0.5) * 16;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 16;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: colorHex,
      size: 0.36,
      transparent: true,
      opacity: 1,
    });
    const points = new THREE.Points(geo, mat);
    this.group.add(points);
    this.bursts.push({ points, velocities: vel, life: 0.45 });
  }

  private distPointToSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
    const ab = b.clone().sub(a);
    const ap = p.clone().sub(a);
    const lenSq = ab.lengthSq();
    if (lenSq === 0) return ap.length();
    const t = Math.max(0, Math.min(1, ap.dot(ab) / lenSq));
    const closest = a.clone().addScaledVector(ab, t);
    return p.distanceTo(closest);
  }
}
