import * as THREE from 'three';
import { ShipPartId, ShipPartState } from './types';

interface PartVisuals {
  group: THREE.Group;
  beaconLight: THREE.PointLight;
  beaconMesh: THREE.Mesh;
  labelSprite: THREE.Sprite;
  labelCanvas: HTMLCanvasElement;
  sparkPoints: THREE.Points;
  leakPoints: THREE.Points;
  hitbox: THREE.Mesh;
}

export class Submarine {
  public group = new THREE.Group();
  public turretPivot = new THREE.Group();
  public harpoonBarrel = new THREE.Group();
  public loadedHarpoonMesh!: THREE.Mesh;
  public rotaryBarrel = new THREE.Group();
  public pilotChairHitbox!: THREE.Mesh;

  private portSpot: THREE.SpotLight;
  private starSpot: THREE.SpotLight;
  private turretSpot: THREE.SpotLight;
  private lightCones: THREE.Mesh[] = [];
  private cabinLight: THREE.PointLight;
  private aftLight: THREE.PointLight;
  private floodWaterMesh: THREE.Mesh;

  public parts: ShipPartState[] = [];
  private partVisuals = new Map<ShipPartId, PartVisuals>();
  private rotarySpin = 0;
  private recoilHarpoon = 0;
  private recoilRotary = 0;

  constructor(scene: THREE.Scene) {
    this.initPartsData();

    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x1c2836,
      roughness: 0.65,
      metalness: 0.72,
    });
    const ribMat = new THREE.MeshStandardMaterial({
      color: 0x2b3c4f,
      roughness: 0.5,
      metalness: 0.8,
    });
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x131c26,
      roughness: 0.8,
      metalness: 0.55,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xb4833e,
      roughness: 0.38,
      metalness: 0.85,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x8be0ff,
      transparent: true,
      opacity: 0.14,
      roughness: 0.08,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Floor & Grating
    const floor = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.25, 10.6), floorMat);
    floor.position.set(0, -0.125, 1.6);
    this.group.add(floor);

    // Center walkway stripe
    const walkway = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 9.2),
      new THREE.MeshStandardMaterial({ color: 0x243447, roughness: 0.7 })
    );
    walkway.rotation.x = -Math.PI / 2;
    walkway.position.set(0, 0.01, 1.7);
    this.group.add(walkway);

    // Ceiling
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.25, 10.4), hullMat);
    ceiling.position.set(0, 2.95, 1.7);
    this.group.add(ceiling);

    // Left & Right Cabin Bulkhead Walls (with porthole gaps)
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.1, 9.8), hullMat);
    leftWall.position.set(-2.65, 1.45, 2.0);
    this.group.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.1, 9.8), hullMat);
    rightWall.position.set(2.65, 1.45, 2.0);
    this.group.add(rightWall);

    // Aft Wall
    const aftWall = new THREE.Mesh(new THREE.BoxGeometry(5.5, 3.1, 0.35), hullMat);
    aftWall.position.set(0, 1.45, 6.75);
    this.group.add(aftWall);

    // Structural Pressure Ribs along corridor
    for (let z = -2.2; z <= 6.2; z += 2.1) {
      const topRib = new THREE.Mesh(new THREE.BoxGeometry(5.3, 0.22, 0.24), ribMat);
      topRib.position.set(0, 2.75, z);
      this.group.add(topRib);

      const lRib = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.9, 0.24), ribMat);
      lRib.position.set(-2.46, 1.4, z);
      this.group.add(lRib);

      const rRib = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.9, 0.24), ribMat);
      rRib.position.set(2.46, 1.4, z);
      this.group.add(rRib);
    }

    // Front Panoramic Reinforced Dome Frame & Glass
    const noseLowerApron = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.78, 1.4), hullMat);
    noseLowerApron.position.set(0, 0.38, -3.4);
    this.group.add(noseLowerApron);

    const noseUpperApron = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.42, 1.4), hullMat);
    noseUpperApron.position.set(0, 2.82, -3.4);
    this.group.add(noseUpperApron);

    // Panoramic curved hemisphere viewport looking toward -Z
    const domeGeo = new THREE.SphereGeometry(3.05, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.52);
    domeGeo.rotateX(-Math.PI / 2);
    const domeGlass = new THREE.Mesh(domeGeo, glassMat);
    domeGlass.position.set(0, 1.45, -2.85);
    this.group.add(domeGlass);

    // Brass viewport mullions (thin struts at edges so center view is unobstructed)
    const archRing = new THREE.Mesh(new THREE.TorusGeometry(2.72, 0.08, 12, 36), brassMat);
    archRing.position.set(0, 1.45, -2.95);
    this.group.add(archRing);

    // Pilot Console & Interactive Pilot Chair
    const consoleDesk = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 0.78, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x162433, roughness: 0.45, metalness: 0.7 })
    );
    consoleDesk.position.set(0, 0.52, -2.95);
    this.group.add(consoleDesk);

    // Glowing instrument screens on pilot desk
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9 });
    for (const sx of [-0.65, 0, 0.65]) {
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.26), screenMat);
      scr.position.set(sx, 0.94, -2.62);
      scr.rotation.x = -0.55;
      this.group.add(scr);
    }

    // Pilot Seat
    const chairGroup = new THREE.Group();
    chairGroup.position.set(0, 0, -2.05);
    const seatPedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.55, 12), ribMat);
    seatPedestal.position.y = 0.275;
    const seatCushion = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.14, 0.68), hullMat);
    seatCushion.position.y = 0.58;
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.82, 0.14), hullMat);
    seatBack.position.set(0, 1.02, 0.28);
    chairGroup.add(seatPedestal, seatCushion, seatBack);

    const chairHitGeo = new THREE.BoxGeometry(1.25, 1.7, 1.25);
    const invisibleMat = new THREE.MeshBasicMaterial({ visible: false });
    this.pilotChairHitbox = new THREE.Mesh(chairHitGeo, invisibleMat);
    this.pilotChairHitbox.position.set(0, 0.9, -2.05);
    this.pilotChairHitbox.userData = { type: 'pilot_chair' };
    this.group.add(chairGroup, this.pilotChairHitbox);

    // Exterior Turret Mount & Barrels (visible outside the viewport!)
    this.turretPivot.position.set(0, 1.35, -3.1);
    this.group.add(this.turretPivot);

    // Left: Heavy Harpoon Launcher
    this.harpoonBarrel.position.set(-1.35, -0.52, -0.95);
    const harpTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.14, 1.65, 12),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.35 })
    );
    harpTube.rotation.x = Math.PI / 2;
    const harpRails = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 1.75), brassMat);
    harpRails.position.y = -0.09;

    // Loaded harpoon spear tip visible when ready
    const spearGeo = new THREE.ConeGeometry(0.09, 0.55, 8);
    spearGeo.rotateX(-Math.PI / 2);
    this.loadedHarpoonMesh = new THREE.Mesh(
      spearGeo,
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.8,
        metalness: 0.8,
      })
    );
    this.loadedHarpoonMesh.position.set(0, 0, -1.05);
    this.harpoonBarrel.add(harpTube, harpRails, this.loadedHarpoonMesh);
    this.turretPivot.add(this.harpoonBarrel);

    // Right: Rotary 20mm Autocannon
    this.rotaryBarrel.position.set(1.35, -0.52, -0.95);
    const rotHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.7, 12), ribMat);
    rotHousing.rotation.x = Math.PI / 2;
    rotHousing.position.z = 0.2;
    this.rotaryBarrel.add(rotHousing);
    for (let b = 0; b < 4; b++) {
      const ang = (b / 4) * Math.PI * 2;
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 1.6, 8),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.25 })
      );
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(Math.cos(ang) * 0.09, Math.sin(ang) * 0.09, -0.35);
      this.rotaryBarrel.add(pipe);
    }
    this.turretPivot.add(this.rotaryBarrel);

    // Exterior Floodlights + Volumetric Cones
    this.portSpot = new THREE.SpotLight(0xdff6ff, 5.5, 115, Math.PI * 0.34, 0.45, 1.1);
    this.portSpot.position.set(-1.9, 0.6, -4.1);
    this.portSpot.target.position.set(-4.0, 0.2, -45);
    this.group.add(this.portSpot, this.portSpot.target);

    this.starSpot = new THREE.SpotLight(0xdff6ff, 5.5, 115, Math.PI * 0.34, 0.45, 1.1);
    this.starSpot.position.set(1.9, 0.6, -4.1);
    this.starSpot.target.position.set(4.0, 0.2, -45);
    this.group.add(this.starSpot, this.starSpot.target);

    this.turretSpot = new THREE.SpotLight(0xffffff, 7.2, 130, Math.PI * 0.25, 0.35, 1.0);
    this.turretSpot.position.set(0, 0, -0.6);
    this.turretSpot.target.position.set(0, 0, -50);
    this.turretPivot.add(this.turretSpot, this.turretSpot.target);

    const coneGeo = new THREE.ConeGeometry(8.5, 36, 20, 1, true);
    coneGeo.translate(0, -18, 0);
    coneGeo.rotateX(Math.PI / 2);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.055,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (const xPos of [-1.85, 1.85]) {
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(xPos, 0.6, -4.3);
      this.lightCones.push(cone);
      this.group.add(cone);
    }

    // Interior Cabin Lighting (stays dimly lit so you can walk & repair even when Exterior Floodlights are OFF!)
    this.cabinLight = new THREE.PointLight(0x5bb8e8, 1.35, 11);
    this.cabinLight.position.set(0, 2.55, -0.4);
    this.group.add(this.cabinLight);

    this.aftLight = new THREE.PointLight(0xf59e0b, 1.1, 10);
    this.aftLight.position.set(0, 2.55, 4.2);
    this.group.add(this.aftLight);

    // Rising Floodwater Plane inside the Submarine Cabin
    const waterGeo = new THREE.BoxGeometry(5.1, 2.8, 9.8);
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x085a82,
      transparent: true,
      opacity: 0.62,
      roughness: 0.15,
      metalness: 0.1,
    });
    this.floodWaterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.floodWaterMesh.position.set(0, -1.45, 1.8);
    this.floodWaterMesh.visible = false;
    this.group.add(this.floodWaterMesh);

    // Build all 6 Interactive Ship Part Stations
    this.buildPartStations();

    scene.add(this.group);
  }

  private initPartsData(): void {
    this.parts = [
      {
        id: 'electrical',
        name: 'Electrical Grid',
        shortDesc: 'Connect Wires',
        minigame: 'wires',
        damaged: false,
        ruptured: false,
        timer: 0,
        maxTimer: 30,
        position: new THREE.Vector3(-2.32, 1.35, -0.9),
        lookTarget: new THREE.Vector3(0, 1.35, -0.9),
      },
      {
        id: 'sonar',
        name: 'Sonar & Turret Relay',
        shortDesc: 'Keypad Override',
        minigame: 'keypad',
        damaged: false,
        ruptured: false,
        timer: 0,
        maxTimer: 30,
        position: new THREE.Vector3(2.32, 1.35, -0.9),
        lookTarget: new THREE.Vector3(0, 1.35, -0.9),
      },
      {
        id: 'port_hull',
        name: 'Port Hull Plating',
        shortDesc: 'Click Leak Circles',
        minigame: 'circles',
        damaged: false,
        ruptured: false,
        timer: 0,
        maxTimer: 30,
        position: new THREE.Vector3(-2.32, 1.35, 1.65),
        lookTarget: new THREE.Vector3(0, 1.35, 1.65),
      },
      {
        id: 'starboard_hull',
        name: 'Starboard Hull Plating',
        shortDesc: 'Click Leak Circles',
        minigame: 'circles',
        damaged: false,
        ruptured: false,
        timer: 0,
        maxTimer: 30,
        position: new THREE.Vector3(2.32, 1.35, 1.65),
        lookTarget: new THREE.Vector3(0, 1.35, 1.65),
      },
      {
        id: 'ballast',
        name: 'Ballast & O2 Valves',
        shortDesc: 'Balance Pressure',
        minigame: 'sliders',
        damaged: false,
        ruptured: false,
        timer: 0,
        maxTimer: 30,
        position: new THREE.Vector3(2.32, 1.35, 4.2),
        lookTarget: new THREE.Vector3(0, 1.35, 4.2),
      },
      {
        id: 'turbine',
        name: 'Main Ascent Turbine',
        shortDesc: 'Timing Ring Sync',
        minigame: 'timing',
        damaged: false,
        ruptured: false,
        timer: 0,
        maxTimer: 30,
        position: new THREE.Vector3(0, 1.35, 6.25),
        lookTarget: new THREE.Vector3(0, 1.35, 3.0),
      },
    ];
  }

  private buildPartStations(): void {
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0x243b53,
      roughness: 0.45,
      metalness: 0.75,
    });
    const pipeMat = new THREE.MeshStandardMaterial({
      color: 0x9a6b32,
      roughness: 0.35,
      metalness: 0.85,
    });

    for (const part of this.parts) {
      const stGroup = new THREE.Group();
      stGroup.position.copy(part.position);
      stGroup.lookAt(part.lookTarget);

      // Industrial Cabinet / Valve Box
      const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.25, 0.32), boxMat);
      stGroup.add(cabinet);

      const pipeL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 8), pipeMat);
      pipeL.position.set(-0.46, 0.1, 0.16);
      const pipeR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 8), pipeMat);
      pipeR.position.set(0.46, 0.1, 0.16);
      stGroup.add(pipeL, pipeR);

      // Beacon Dome Light
      const beaconMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x22c55e })
      );
      beaconMesh.position.set(0, 0.72, 0.18);
      stGroup.add(beaconMesh);

      const beaconLight = new THREE.PointLight(0xef4444, 0, 5.5);
      beaconLight.position.set(0, 0.75, 0.45);
      stGroup.add(beaconLight);

      // Floating Label Sprite
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 80;
      const tex = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      const labelSprite = new THREE.Sprite(spriteMat);
      labelSprite.scale.set(1.55, 0.48, 1);
      labelSprite.position.set(0, 1.05, 0.25);
      stGroup.add(labelSprite);

      // Sparks particle emitter
      const sparkGeo = new THREE.BufferGeometry();
      const sparkPos = new Float32Array(28 * 3);
      sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
      const sparkPoints = new THREE.Points(
        sparkGeo,
        new THREE.PointsMaterial({ color: 0xfbbf24, size: 0.09, transparent: true, opacity: 0.9 })
      );
      sparkPoints.visible = false;
      stGroup.add(sparkPoints);

      // High-pressure water spray emitter
      const leakGeo = new THREE.BufferGeometry();
      const leakPos = new Float32Array(45 * 3);
      leakGeo.setAttribute('position', new THREE.BufferAttribute(leakPos, 3));
      const leakPoints = new THREE.Points(
        leakGeo,
        new THREE.PointsMaterial({ color: 0x7dd3fc, size: 0.11, transparent: true, opacity: 0.75 })
      );
      leakPoints.visible = false;
      stGroup.add(leakPoints);

      // Raycast Hitbox
      const hitbox = new THREE.Mesh(
        new THREE.BoxGeometry(1.45, 1.75, 0.75),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitbox.userData = { type: 'ship_part', partId: part.id };
      stGroup.add(hitbox);

      this.group.add(stGroup);
      this.partVisuals.set(part.id, {
        group: stGroup,
        beaconLight,
        beaconMesh,
        labelSprite,
        labelCanvas: canvas,
        sparkPoints,
        leakPoints,
        hitbox,
      });

      this.drawStationLabel(part);
    }
  }

  private drawStationLabel(part: ShipPartState): void {
    const vis = this.partVisuals.get(part.id);
    if (!vis) return;
    const ctx = vis.labelCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, 256, 80);
    ctx.fillStyle = part.damaged ? 'rgba(127, 29, 29, 0.9)' : 'rgba(7, 26, 44, 0.85)';
    ctx.strokeStyle = part.damaged ? '#f87171' : '#38bdf8';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 248, 72);
    ctx.fillRect(4, 4, 248, 72);

    ctx.fillStyle = '#f0f9ff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(part.name.toUpperCase(), 128, 34);

    ctx.fillStyle = part.damaged ? '#fde047' : '#4ade80';
    ctx.font = 'bold 16px monospace';
    const sub = part.damaged ? `BREACH! ${part.timer.toFixed(1)}s [E]` : 'INTEGRITY OK';
    ctx.fillText(sub, 128, 60);

    (vis.labelSprite.material as THREE.SpriteMaterial).map!.needsUpdate = true;
  }

  public getInteractables(): THREE.Object3D[] {
    const arr: THREE.Object3D[] = [this.pilotChairHitbox];
    for (const v of this.partVisuals.values()) {
      arr.push(v.hitbox);
    }
    return arr;
  }

  public resetParts(breachTime: number): void {
    for (const p of this.parts) {
      p.damaged = false;
      p.ruptured = false;
      p.maxTimer = breachTime;
      p.timer = breachTime;
      this.drawStationLabel(p);
    }
  }

  public damageRandomPart(breachTime: number): ShipPartState {
    const healthy = this.parts.filter((p) => !p.damaged);
    if (healthy.length > 0) {
      const chosen = healthy[Math.floor(Math.random() * healthy.length)];
      chosen.damaged = true;
      chosen.maxTimer = breachTime;
      chosen.timer = breachTime;
      this.drawStationLabel(chosen);
      return chosen;
    }
    // If all parts already damaged, shave 3.5s off the one with highest timer
    const target = this.parts[Math.floor(Math.random() * this.parts.length)];
    target.timer = Math.max(1.5, target.timer - 3.5);
    this.drawStationLabel(target);
    return target;
  }

  public damageSpecificPart(id: ShipPartId, breachTime: number): ShipPartState {
    const part = this.parts.find((p) => p.id === id) || this.parts[0];
    if (!part.damaged) {
      part.damaged = true;
      part.maxTimer = breachTime;
      part.timer = breachTime;
    } else {
      part.timer = Math.max(2.0, part.timer - 3.0);
    }
    this.drawStationLabel(part);
    return part;
  }

  public repairPart(id: ShipPartId): void {
    const part = this.parts.find((p) => p.id === id);
    if (!part) return;
    part.damaged = false;
    part.timer = part.maxTimer;
    this.drawStationLabel(part);
    const vis = this.partVisuals.get(id);
    if (vis) {
      vis.beaconLight.intensity = 0;
      (vis.beaconMesh.material as THREE.MeshBasicMaterial).color.setHex(0x22c55e);
      vis.sparkPoints.visible = false;
      vis.leakPoints.visible = false;
    }
  }

  public triggerWeaponRecoil(type: 'harpoon' | 'bullets'): void {
    if (type === 'harpoon') {
      this.recoilHarpoon = 0.36;
    } else {
      this.recoilRotary = 0.12;
      this.rotarySpin += 1.2;
    }
  }

  public getHarpoonMuzzleWorldPos(): THREE.Vector3 {
    const v = new THREE.Vector3(0, 0, -1.2);
    this.harpoonBarrel.localToWorld(v);
    return v;
  }

  public getRotaryMuzzleWorldPos(): THREE.Vector3 {
    const v = new THREE.Vector3(0, 0, -1.2);
    this.rotaryBarrel.localToWorld(v);
    return v;
  }

  public update(
    dt: number,
    time: number,
    lightsOn: boolean,
    harpoonLoaded: boolean,
    floodPercent: number,
    turretYaw: number,
    turretPitch: number
  ): ShipPartState | null {
    // Aim exterior turret & center spotlight
    this.turretPivot.rotation.set(turretPitch, turretYaw, 0, 'YXZ');

    // Barrel recoil recovery & rotary spin
    this.recoilHarpoon = Math.max(0, this.recoilHarpoon - dt * 1.4);
    this.recoilRotary = Math.max(0, this.recoilRotary - dt * 1.8);
    this.harpoonBarrel.position.z = -0.95 + this.recoilHarpoon;
    this.rotaryBarrel.position.z = -0.95 + this.recoilRotary;
    this.rotaryBarrel.rotation.z += this.rotarySpin * dt * 8;
    this.rotarySpin = Math.max(0, this.rotarySpin - dt * 3.5);
    this.loadedHarpoonMesh.visible = harpoonLoaded;

    // Electrical Grid damage causes lights to flicker erratically
    const elecDamaged = this.isPartDamaged('electrical');
    const flicker = elecDamaged ? (Math.sin(time * 27) > -0.3 ? 1 : 0.12) : 1;
    const effectiveLight = lightsOn ? flicker : 0;

    this.portSpot.intensity = 5.5 * effectiveLight;
    this.starSpot.intensity = 5.5 * effectiveLight;
    this.turretSpot.intensity = 7.2 * effectiveLight;
    for (const cone of this.lightCones) {
      cone.visible = effectiveLight > 0.2;
      (cone.material as THREE.MeshBasicMaterial).opacity = 0.055 * effectiveLight;
    }

    // Update rising cabin water level
    if (floodPercent > 1) {
      this.floodWaterMesh.visible = true;
      // Rises from floor (0m) up to ceiling (2.6m)
      const waterHeight = (floodPercent / 100) * 2.55;
      this.floodWaterMesh.position.y = -1.4 + waterHeight;
    } else {
      this.floodWaterMesh.visible = false;
    }

    // Tick damaged part timers & 3D particle FX
    let rupturedPart: ShipPartState | null = null;
    for (const part of this.parts) {
      const vis = this.partVisuals.get(part.id)!;
      if (!part.damaged) {
        vis.sparkPoints.visible = false;
        vis.leakPoints.visible = false;
        vis.beaconLight.intensity = 0;
        continue;
      }

      part.timer -= dt;
      if (part.timer <= 0) {
        part.timer = 0;
        part.ruptured = true;
        rupturedPart = part;
      }

      // Red flashing alarm strobe
      const strobe = 0.5 + 0.5 * Math.sin(time * 12);
      vis.beaconLight.intensity = 2.4 * strobe;
      (vis.beaconMesh.material as THREE.MeshBasicMaterial).color.setHex(strobe > 0.5 ? 0xff3333 : 0x660000);

      // Update sparks
      vis.sparkPoints.visible = true;
      const sArr = vis.sparkPoints.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < 28; i++) {
        const phase = (time * 3.5 + i * 0.37) % 1;
        sArr[i * 3] = (Math.sin(i * 19.1) * 0.45) * phase;
        sArr[i * 3 + 1] = 0.2 - phase * phase * 0.9;
        sArr[i * 3 + 2] = 0.2 + phase * 0.65;
      }
      vis.sparkPoints.geometry.attributes.position.needsUpdate = true;

      // Update high-pressure water spray
      vis.leakPoints.visible = true;
      const lArr = vis.leakPoints.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < 45; i++) {
        const phase = (time * 2.8 + i * 0.19) % 1;
        lArr[i * 3] = Math.cos(i * 7.3) * 0.18 * phase;
        lArr[i * 3 + 1] = -0.1 - phase * phase * 0.65;
        lArr[i * 3 + 2] = 0.18 + phase * 1.45;
      }
      vis.leakPoints.geometry.attributes.position.needsUpdate = true;

      this.drawStationLabel(part);
    }

    return rupturedPart;
  }

  public isPartDamaged(id: ShipPartId): boolean {
    return !!this.parts.find((p) => p.id === id)?.damaged;
  }

  public countDamagedParts(): number {
    return this.parts.filter((p) => p.damaged).length;
  }
}
