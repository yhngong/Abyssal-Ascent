import * as THREE from 'three';
import { DEPTH_ZONES } from './types';

export class OceanEnvironment {
  public group = new THREE.Group();
  private ambientLight: THREE.AmbientLight;
  private surfaceSunLight: THREE.DirectionalLight;
  private snowPoints: THREE.Points;
  private snowPositions: Float32Array;
  private snowCount = 1400;

  private bioPoints: THREE.Points;
  private bioPositions: Float32Array;
  private bioCount = 450;

  private rockPillars: THREE.Mesh[] = [];
  private sonarRing: THREE.Mesh;
  private sonarWaveActive = false;
  private sonarWaveRadius = 0;

  private surfaceMesh: THREE.Mesh;
  private fog: THREE.FogExp2;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.fog = new THREE.FogExp2(0x010409, 0.017);
    this.scene.fog = this.fog;
    this.scene.background = new THREE.Color(0x010409);

    this.ambientLight = new THREE.AmbientLight(0x071426, 0.24);
    this.group.add(this.ambientLight);

    this.surfaceSunLight = new THREE.DirectionalLight(0x9be7ff, 0.05);
    this.surfaceSunLight.position.set(15, 80, -25);
    this.group.add(this.surfaceSunLight);

    // Marine snow particle field
    const snowGeo = new THREE.BufferGeometry();
    this.snowPositions = new Float32Array(this.snowCount * 3);
    for (let i = 0; i < this.snowCount; i++) {
      this.snowPositions[i * 3] = (Math.random() - 0.5) * 140;
      this.snowPositions[i * 3 + 1] = (Math.random() - 0.5) * 110;
      this.snowPositions[i * 3 + 2] = -Math.random() * 140 + 25;
    }
    snowGeo.setAttribute('position', new THREE.BufferAttribute(this.snowPositions, 3));
    const snowMat = new THREE.PointsMaterial({
      color: 0x9bd7f5,
      size: 0.24,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.snowPoints = new THREE.Points(snowGeo, snowMat);
    this.group.add(this.snowPoints);

    // Bioluminescent plankton specks
    const bioGeo = new THREE.BufferGeometry();
    this.bioPositions = new Float32Array(this.bioCount * 3);
    const bioColors = new Float32Array(this.bioCount * 3);
    const palette = [
      new THREE.Color(0x22d3ee),
      new THREE.Color(0x38bdf8),
      new THREE.Color(0xa855f7),
      new THREE.Color(0x4ade80),
    ];
    for (let i = 0; i < this.bioCount; i++) {
      this.bioPositions[i * 3] = (Math.random() - 0.5) * 130;
      this.bioPositions[i * 3 + 1] = (Math.random() - 0.5) * 100;
      this.bioPositions[i * 3 + 2] = -Math.random() * 130 + 15;
      const c = palette[i % palette.length];
      bioColors[i * 3] = c.r;
      bioColors[i * 3 + 1] = c.g;
      bioColors[i * 3 + 2] = c.b;
    }
    bioGeo.setAttribute('position', new THREE.BufferAttribute(this.bioPositions, 3));
    bioGeo.setAttribute('color', new THREE.BufferAttribute(bioColors, 3));
    const bioMat = new THREE.PointsMaterial({
      size: 0.42,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.bioPoints = new THREE.Points(bioGeo, bioMat);
    this.group.add(this.bioPoints);

    // Distant trench rock spires passing by to give vertical motion cues
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x0b1724,
      roughness: 0.92,
      metalness: 0.08,
      flatShading: true,
    });
    for (let i = 0; i < 18; i++) {
      const radius = 3.5 + Math.random() * 7;
      const height = 16 + Math.random() * 28;
      const geo = new THREE.ConeGeometry(radius, height, 6, 2);
      const mesh = new THREE.Mesh(geo, rockMat);
      this.placeRockPillar(mesh, (Math.random() - 0.5) * 120);
      this.rockPillars.push(mesh);
      this.group.add(mesh);
    }

    // 3D Sonar expanding ring
    const ringGeo = new THREE.SphereGeometry(1, 28, 18);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      wireframe: true,
      transparent: true,
      opacity: 0,
    });
    this.sonarRing = new THREE.Mesh(ringGeo, ringMat);
    this.sonarRing.visible = false;
    this.group.add(this.sonarRing);

    // Ocean surface shimmer visible near 0m
    const surfGeo = new THREE.PlaneGeometry(360, 360, 24, 24);
    surfGeo.rotateX(Math.PI / 2);
    const surfMat = new THREE.MeshBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
    });
    this.surfaceMesh = new THREE.Mesh(surfGeo, surfMat);
    this.surfaceMesh.position.y = 200;
    this.surfaceMesh.visible = false;
    this.group.add(this.surfaceMesh);

    this.scene.add(this.group);
  }

  private placeRockPillar(mesh: THREE.Mesh, yPos: number): void {
    // Keep outside the central submarine shaft (radius > 24)
    const angle = Math.random() * Math.PI * 2;
    const dist = 32 + Math.random() * 58;
    mesh.position.set(Math.cos(angle) * dist, yPos, Math.sin(angle) * dist - 18);
    mesh.rotation.set(
      (Math.random() - 0.5) * 0.4,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * 0.4
    );
  }

  public triggerSonarWave(): void {
    this.sonarWaveActive = true;
    this.sonarWaveRadius = 3;
    this.sonarRing.visible = true;
    this.sonarRing.scale.setScalar(this.sonarWaveRadius);
    (this.sonarRing.material as THREE.MeshBasicMaterial).opacity = 0.55;
  }

  public getZoneName(depth: number): string {
    for (const z of DEPTH_ZONES) {
      if (depth >= z.minDepth && depth <= z.maxDepth) return z.name;
    }
    return DEPTH_ZONES[DEPTH_ZONES.length - 1].name;
  }

  public update(dt: number, depth: number, ascentSpeedNow: number, lightsOn: boolean, time: number): void {
    // Smooth zone color & lighting interpolation
    let zIndex = 0;
    for (let i = 0; i < DEPTH_ZONES.length; i++) {
      if (depth >= DEPTH_ZONES[i].minDepth) {
        zIndex = i;
        break;
      }
    }
    const curr = DEPTH_ZONES[zIndex];
    const next = DEPTH_ZONES[Math.min(DEPTH_ZONES.length - 1, zIndex + 1)];
    const span = Math.max(1, curr.maxDepth - curr.minDepth);
    const t = 1 - Math.min(1, Math.max(0, (depth - curr.minDepth) / span));

    const fogCol = new THREE.Color(curr.fogColor).lerp(new THREE.Color(next.fogColor), t * 0.65);
    const ambCol = new THREE.Color(curr.ambientColor).lerp(new THREE.Color(next.ambientColor), t * 0.65);

    this.fog.color.copy(fogCol);
    (this.scene.background as THREE.Color).copy(fogCol);

    // When floodlights are OFF in deep water, exterior ambient drops dramatically so only bioluminescence glows!
    const darkMultiplier = lightsOn ? 1.0 : (depth > 800 ? 0.32 : 0.75);
    this.fog.density = THREE.MathUtils.lerp(curr.fogDensity, next.fogDensity, t * 0.65) * (lightsOn ? 1.0 : 1.22);
    this.ambientLight.color.copy(ambCol);
    this.ambientLight.intensity = THREE.MathUtils.lerp(curr.ambientIntensity, next.ambientIntensity, t * 0.65) * darkMultiplier;

    // Sunlight intensifies near surface (< 1200m)
    const sunFactor = Math.max(0, 1 - depth / 1200);
    this.surfaceSunLight.intensity = 0.04 + sunFactor * 2.1;

    // Move marine snow downward relative to ascent speed
    const visualFall = 1.2 + ascentSpeedNow * 0.38;
    for (let i = 0; i < this.snowCount; i++) {
      let y = this.snowPositions[i * 3 + 1] - visualFall * dt;
      let x = this.snowPositions[i * 3] + Math.sin(time * 0.7 + i) * 0.015;
      if (y < -55) {
        y = 55;
        x = (Math.random() - 0.5) * 140;
      }
      this.snowPositions[i * 3] = x;
      this.snowPositions[i * 3 + 1] = y;
    }
    this.snowPoints.geometry.attributes.position.needsUpdate = true;

    // Bioluminescent plankton drift
    for (let i = 0; i < this.bioCount; i++) {
      let y = this.bioPositions[i * 3 + 1] - (0.6 + ascentSpeedNow * 0.28) * dt;
      if (y < -50) y = 50;
      this.bioPositions[i * 3 + 1] = y;
    }
    this.bioPoints.geometry.attributes.position.needsUpdate = true;
    (this.bioPoints.material as THREE.PointsMaterial).opacity = depth > 400 ? 0.85 : 0.35;

    // Trench rock spires pass downward
    for (const rock of this.rockPillars) {
      rock.position.y -= (0.4 + ascentSpeedNow * 0.42) * dt;
      if (rock.position.y < -65) {
        this.placeRockPillar(rock, 65 + Math.random() * 25);
      }
      // Fewer spires near open upper ocean
      rock.visible = depth > 350;
    }

    // Surface plane visible when close to 0m
    if (depth < 180) {
      this.surfaceMesh.visible = true;
      this.surfaceMesh.position.y = Math.max(2.5, depth * 0.9);
    } else {
      this.surfaceMesh.visible = false;
    }

    // Sonar wave expansion
    if (this.sonarWaveActive) {
      this.sonarWaveRadius += 78 * dt;
      this.sonarRing.scale.setScalar(this.sonarWaveRadius);
      const mat = this.sonarRing.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 0.55 * (1 - this.sonarWaveRadius / 120));
      if (this.sonarWaveRadius >= 120) {
        this.sonarWaveActive = false;
        this.sonarRing.visible = false;
      }
    }
  }
}
