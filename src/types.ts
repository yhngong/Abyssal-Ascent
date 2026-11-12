import * as THREE from 'three';

export type DifficultyId = 'explorer' | 'diver' | 'abyssal' | 'nightmare';

export interface DifficultyConfig {
  id: DifficultyId;
  name: string;
  badge: string;
  color: string;
  description: string;
  ascentSpeed: number;         // meters per second when motor ON
  overdriveMultiplier: number; // multiplier when holding Shift
  breachTimeSeconds: number;   // seconds before a damaged part ruptures & drowns you
  spawnIntervalSec: number;    // base monster spawn interval
  maxConcurrentMonsters: number;
  monsterSpeedMult: number;
  monsterHpMult: number;
  passiveLeakRate: number;     // % cabin flooding per second per un-ruptured damaged part
}

export const DIFFICULTIES: DifficultyConfig[] = [
  {
    id: 'explorer',
    name: 'EXPLORER',
    badge: 'EASY',
    color: '#4ade80',
    description: 'Generous hull tolerances, faster ballast ascent, and calmer deep-sea fauna.',
    ascentSpeed: 48,
    overdriveMultiplier: 1.55,
    breachTimeSeconds: 46,
    spawnIntervalSec: 8.5,
    maxConcurrentMonsters: 4,
    monsterSpeedMult: 0.82,
    monsterHpMult: 0.8,
    passiveLeakRate: 0.45,
  },
  {
    id: 'diver',
    name: 'DIVER',
    badge: 'NORMAL',
    color: '#38bdf8',
    description: 'Standard bathyscaphe mission profile. Manage light, noise, weapons, and repairs.',
    ascentSpeed: 38,
    overdriveMultiplier: 1.5,
    breachTimeSeconds: 34,
    spawnIntervalSec: 6.5,
    maxConcurrentMonsters: 6,
    monsterSpeedMult: 1.0,
    monsterHpMult: 1.0,
    passiveLeakRate: 0.75,
  },
  {
    id: 'abyssal',
    name: 'ABYSSAL',
    badge: 'HARD',
    color: '#fb923c',
    description: 'Crushing pressure, aggressive hunter packs, and rapid hull fracture timers.',
    ascentSpeed: 31,
    overdriveMultiplier: 1.45,
    breachTimeSeconds: 25,
    spawnIntervalSec: 4.9,
    maxConcurrentMonsters: 8,
    monsterSpeedMult: 1.18,
    monsterHpMult: 1.25,
    passiveLeakRate: 1.1,
  },
  {
    id: 'nightmare',
    name: 'HADAL NIGHTMARE',
    badge: 'EXTREME',
    color: '#f87171',
    description: 'Relentless apex leviathans from 12,000m up. One neglected breach means instant doom.',
    ascentSpeed: 26,
    overdriveMultiplier: 1.4,
    breachTimeSeconds: 19,
    spawnIntervalSec: 3.7,
    maxConcurrentMonsters: 10,
    monsterSpeedMult: 1.35,
    monsterHpMult: 1.45,
    passiveLeakRate: 1.5,
  },
];

export type MinigameType = 'wires' | 'circles' | 'timing' | 'sliders' | 'keypad';

export type ShipPartId =
  | 'port_hull'
  | 'starboard_hull'
  | 'electrical'
  | 'turbine'
  | 'ballast'
  | 'sonar';

export interface ShipPartState {
  id: ShipPartId;
  name: string;
  shortDesc: string;
  minigame: MinigameType;
  damaged: boolean;
  ruptured: boolean;
  timer: number;       // remaining seconds until rupture
  maxTimer: number;
  position: THREE.Vector3; // 3D location inside submarine cabin
  lookTarget: THREE.Vector3;
}

export type WeaponType = 'harpoon' | 'bullets';

export type MonsterType =
  | 'blind_stalker'
  | 'photovore'
  | 'shadow_kraken'
  | 'crusher'
  | 'razor_swarm'
  | 'volt_jelly'
  | 'mimic_siren';

export interface DepthZoneInfo {
  name: string;
  minDepth: number; // closer to surface
  maxDepth: number; // deeper
  fogColor: number;
  ambientColor: number;
  ambientIntensity: number;
  fogDensity: number;
}

export const DEPTH_ZONES: DepthZoneInfo[] = [
  {
    name: 'HADAL TRENCH',
    minDepth: 8000,
    maxDepth: 12000,
    fogColor: 0x010409,
    ambientColor: 0x071426,
    ambientIntensity: 0.22,
    fogDensity: 0.017,
  },
  {
    name: 'ABYSSAL PLAIN',
    minDepth: 4500,
    maxDepth: 8000,
    fogColor: 0x020916,
    ambientColor: 0x0a223d,
    ambientIntensity: 0.32,
    fogDensity: 0.015,
  },
  {
    name: 'MIDNIGHT ZONE',
    minDepth: 1500,
    maxDepth: 4500,
    fogColor: 0x031429,
    ambientColor: 0x0e345a,
    ambientIntensity: 0.45,
    fogDensity: 0.013,
  },
  {
    name: 'TWILIGHT ZONE',
    minDepth: 300,
    maxDepth: 1500,
    fogColor: 0x062c4d,
    ambientColor: 0x1a628f,
    ambientIntensity: 0.72,
    fogDensity: 0.0105,
  },
  {
    name: 'SUNLIGHT ZONE',
    minDepth: 0,
    maxDepth: 300,
    fogColor: 0x0d5c87,
    ambientColor: 0x5cc8ff,
    ambientIntensity: 1.25,
    fogDensity: 0.0075,
  },
];

export const STARTING_DEPTH = 12000;
