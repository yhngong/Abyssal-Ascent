import * as THREE from 'three';

export interface OilBarrelInstance {
  id: number;
  group: THREE.Group;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotSpeed: THREE.Vector3;
  bulletHits: number;
  hitRadius: number;
}

let nextBarrelId = 1;

/**
 * Builds a 3D 55-gallon Oil Barrel mesh.
 * - Real oil barrels have `glowing = false` (matte painted metal, zero self-emission).
 * - Mimic Sirens call `buildOilBarrelMesh(true)` so their decoy barrel glows!
 */
export function buildOilBarrelMesh(glowing: boolean): THREE.Group {
  const barrel = new THREE.Group();

  const bodyMat = glowing
    ? new THREE.MeshStandardMaterial({
        color: 0xd97706,
        emissive: 0xff9e1b,
        emissiveIntensity: 0.92,
        roughness: 0.35,
        metalness: 0.2,
      })
    : new THREE.MeshStandardMaterial({
        color: 0x855316, // Matte weathered industrial amber-brown steel (NO glow!)
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.78,
        metalness: 0.35,
      });

  const stripeMat = glowing
    ? new THREE.MeshStandardMaterial({
        color: 0x3b2818,
        emissive: 0xf43f5e,
        emissiveIntensity: 0.55,
        roughness: 0.4,
      })
    : new THREE.MeshStandardMaterial({
        color: 0x1e293b, // Dark painted center band (NO glow!)
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.72,
        metalness: 0.4,
      });

  const hoopMat = glowing
    ? new THREE.MeshStandardMaterial({
        color: 0xfde047,
        emissive: 0xfbbf24,
        emissiveIntensity: 0.85,
        roughness: 0.3,
      })
    : new THREE.MeshStandardMaterial({
        color: 0x475569,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.6,
        metalness: 0.55,
      });

  // Main cylindrical drum
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 1.95, 18), bodyMat);
  barrel.add(drum);

  // Dark painted center hazard band
  const centerBand = new THREE.Mesh(new THREE.CylinderGeometry(0.73, 0.73, 0.62, 18), stripeMat);
  barrel.add(centerBand);

  // Top & bottom chime rims + 2 rolling hoops
  for (const yPos of [-0.95, -0.34, 0.34, 0.95]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.73, 0.045, 8, 20), hoopMat);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = yPos;
    barrel.add(hoop);
  }

  // Dual bung caps on top lid
  const cap1 = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 10), hoopMat);
  cap1.position.set(0.32, 0.99, 0.12);
  const cap2 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 10), hoopMat);
  cap2.position.set(-0.28, 0.99, -0.18);
  barrel.add(cap1, cap2);

  // Subtle eerie aura shell ONLY on the Mimic Siren's glowing barrel decoy
  if (glowing) {
    const aura = new THREE.Mesh(
      new THREE.CylinderGeometry(0.86, 0.86, 2.12, 16),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      })
    );
    barrel.add(aura);
  }

  return barrel;
}

export class OilBarrelManager {
  public group = new THREE.Group();
  public barrels: OilBarrelInstance[] = [];
  private spawnTimer = 5.5;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  public clearAll(): void {
    for (const b of this.barrels) {
      this.group.remove(b.group);
    }
    this.barrels = [];
    this.spawnTimer = 5.5;
  }

  public removeBarrel(b: OilBarrelInstance): void {
    const idx = this.barrels.indexOf(b);
    if (idx !== -1) {
      this.group.remove(b.group);
      this.barrels.splice(idx, 1);
    }
  }

  public update(dt: number, depth: number, currentPower: number): number {
    let collectedCount = 0;

    // Spawn faster if player is running low on power so they are never stranded!
    const lowPowerBoost = currentPower < 35 ? 0.58 : 1.0;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.barrels.length < 3 && depth > 40) {
      this.spawnBarrel();
      this.spawnTimer = (11.0 + Math.random() * 4.5) * lowPowerBoost;
    }

    const subScoopTarget = new THREE.Vector3(0, 1.1, -3.8);

    for (let i = this.barrels.length - 1; i >= 0; i--) {
      const b = this.barrels[i];
      const toSub = subScoopTarget.clone().sub(b.position);
      const dist = toSub.length();

      // Drift steadily toward submarine so player sees it approaching on radar & viewport
      const dir = toSub.normalize();
      b.velocity.lerp(dir.multiplyScalar(6.4), Math.min(1, dt * 2.5));
      b.position.addScaledVector(b.velocity, dt);
      b.group.position.copy(b.position);

      // Gentle ocean tumble
      b.group.rotation.x += b.rotSpeed.x * dt;
      b.group.rotation.y += b.rotSpeed.y * dt;
      b.group.rotation.z += b.rotSpeed.z * dt;

      // Scooped into submarine fuel intake!
      if (dist <= 6.8) {
        collectedCount++;
        this.group.remove(b.group);
        this.barrels.splice(i, 1);
        continue;
      }

      if (dist > 135 || b.position.z > 15) {
        this.group.remove(b.group);
        this.barrels.splice(i, 1);
      }
    }

    return collectedCount;
  }

  private spawnBarrel(): void {
    const meshGroup = buildOilBarrelMesh(false);
    // Tilt initial barrel orientation naturally
    meshGroup.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

    const angleX = (Math.random() - 0.5) * 1.15;
    const angleY = (Math.random() - 0.5) * 0.45;
    const dist = 74 + Math.random() * 20;

    const pos = new THREE.Vector3(
      Math.sin(angleX) * dist,
      1.3 + Math.sin(angleY) * dist * 0.5,
      -Math.cos(angleX) * dist
    );
    meshGroup.position.copy(pos);

    this.barrels.push({
      id: nextBarrelId++,
      group: meshGroup,
      position: pos,
      velocity: new THREE.Vector3(0, 0, 5),
      rotSpeed: new THREE.Vector3(
        (Math.random() - 0.5) * 0.9,
        (Math.random() - 0.5) * 0.9,
        (Math.random() - 0.5) * 0.9
      ),
      bulletHits: 0,
      hitRadius: 1.5,
    });
    this.group.add(meshGroup);
  }
}
