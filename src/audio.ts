export class SoundEngine {
  private ctx: AudioContext | null = null;
  private motorOsc: OscillatorNode | null = null;
  private motorSubOsc: OscillatorNode | null = null;
  private motorGain: GainNode | null = null;
  private initialized = false;

  public init(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioCtx();

    // Continuous Motor Hum
    this.motorOsc = this.ctx.createOscillator();
    this.motorSubOsc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    this.motorGain = this.ctx.createGain();

    this.motorOsc.type = 'sawtooth';
    this.motorOsc.frequency.value = 52;
    this.motorSubOsc.type = 'sine';
    this.motorSubOsc.frequency.value = 26;

    filter.type = 'lowpass';
    filter.frequency.value = 135;

    this.motorGain.gain.value = 0.0;

    this.motorOsc.connect(filter);
    this.motorSubOsc.connect(filter);
    filter.connect(this.motorGain);
    this.motorGain.connect(this.ctx.destination);

    this.motorOsc.start();
    this.motorSubOsc.start();
    this.initialized = true;
  }

  public setMotorState(running: boolean, overdrive: boolean, activeGame: boolean): void {
    if (!this.ctx || !this.motorGain || !this.motorOsc || !this.motorSubOsc) return;
    const now = this.ctx.currentTime;
    if (!activeGame || !running) {
      this.motorGain.gain.setTargetAtTime(0.0001, now, 0.18);
    } else {
      const targetGain = overdrive ? 0.13 : 0.075;
      const baseFreq = overdrive ? 76 : 50;
      this.motorGain.gain.setTargetAtTime(targetGain, now, 0.15);
      this.motorOsc.frequency.setTargetAtTime(baseFreq, now, 0.2);
      this.motorSubOsc.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.2);
    }
  }

  public playSonarPing(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1480, now);
    osc.frequency.exponentialRampToValueAtTime(1390, now + 1.4);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 1.55);
  }

  public playHarpoonFire(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Pneumatic thump
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(210, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.26);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);

    // Cable zing
    const wire = this.ctx.createOscillator();
    const wGain = this.ctx.createGain();
    wire.type = 'sawtooth';
    wire.frequency.setValueAtTime(620, now);
    wire.frequency.linearRampToValueAtTime(1150, now + 0.14);
    wGain.gain.setValueAtTime(0.06, now);
    wGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    wire.connect(wGain);
    wGain.connect(this.ctx.destination);
    wire.start(now);
    wire.stop(now + 0.17);
  }

  public playBulletFire(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(175 + Math.random() * 35, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.085);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.095);
  }

  public playRicochet(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1950, now);
    osc.frequency.exponentialRampToValueAtTime(720, now + 0.16);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  public playMonsterHit(killed: boolean): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = killed ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(killed ? 150 : 320, now);
    osc.frequency.exponentialRampToValueAtTime(killed ? 34 : 110, now + (killed ? 0.45 : 0.12));
    gain.gain.setValueAtTime(killed ? 0.22 : 0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (killed ? 0.48 : 0.13));
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.5);
  }

  public playHullImpact(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Deep hull slam
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(98, now);
    osc.frequency.exponentialRampToValueAtTime(24, now + 0.65);
    gain.gain.setValueAtTime(0.36, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.68);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.7);

    // Klaxon double-beep
    this.playKlaxon();
  }

  public playKlaxon(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const t = now + i * 0.24;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(640, t);
      osc.frequency.linearRampToValueAtTime(480, t + 0.18);
      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  }

  public playRepairSuccess(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const t = now + idx * 0.08;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }

  public playMiniClick(good = true): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(good ? 880 : 210, now);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playRuptureDrown(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // White noise water rush
    const bufferSize = this.ctx.sampleRate * 2.2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(420, now);
    filter.frequency.exponentialRampToValueAtTime(140, now + 2.0);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.1);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
  }
}
