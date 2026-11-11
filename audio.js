/**
 * HF-26 APEX ULTRA — Procedural WebAudio 1.6L 90° V6 15,000 RPM Hybrid Sound Synthesizer.
 * Generates multi-harmonic V6 firing order synthesis, hydroformed Inconel 6-into-1
 * exhaust formant resonance, 125,000 RPM MGU-H split-turbo compressor whine, and
 * seamless-shift ignition cut pops.
 */

export class F1AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.rpm = 3800;
    this.targetRpm = 3800;
    this.throttle = 0.15;
    this.oscBank = [];
    this.masterGain = null;
    this.formant1 = null;
    this.formant2 = null;
    this.turboOsc = null;
    this.turboGain = null;
    this.noiseNode = null;
    this.noiseFilter = null;
    this.noiseGain = null;
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.0;

      // Subtle waveshaper saturation for metallic Inconel exhaust bite
      const shaper = this.ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        const x = (i * 2) / 1024 - 1;
        curve[i] = Math.tanh(x * 2.4);
      }
      shaper.curve = curve;
      shaper.oversample = '2x';

      // Dual bandpass exhaust manifold formant filters
      this.formant1 = this.ctx.createBiquadFilter();
      this.formant1.type = 'bandpass';
      this.formant1.frequency.value = 280;
      this.formant1.Q.value = 2.2;

      this.formant2 = this.ctx.createBiquadFilter();
      this.formant2.type = 'peaking';
      this.formant2.frequency.value = 820;
      this.formant2.Q.value = 1.8;
      this.formant2.gain.value = 9.0;

      const lowshelf = this.ctx.createBiquadFilter();
      lowshelf.type = 'lowshelf';
      lowshelf.frequency.value = 140;
      lowshelf.gain.value = 6.0;

      shaper.connect(this.formant1);
      shaper.connect(this.formant2);
      this.formant1.connect(lowshelf);
      this.formant2.connect(lowshelf);
      lowshelf.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      // Multi-harmonic oscillator bank for 90-degree V6 firing order
      const harmonics = [
        { mult: 0.5, type: 'sawtooth', gain: 0.16 }, // Sub-harmonic crank rumble
        { mult: 1.0, type: 'sawtooth', gain: 0.38 }, // Primary 3-cyl-per-rev V6 firing fundamental
        { mult: 1.5, type: 'square', gain: 0.18 },   // 90° V-angle bank cross-talk
        { mult: 2.0, type: 'sawtooth', gain: 0.26 }, // 6-into-1 collector harmonic
        { mult: 3.0, type: 'triangle', gain: 0.14 }, // High-RPM metallic rasp
      ];

      for (const h of harmonics) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = h.type;
        osc.frequency.value = 180 * h.mult;
        g.gain.value = h.gain;
        osc.connect(g);
        g.connect(shaper);
        osc.start();
        this.oscBank.push({ osc, gainNode: g, mult: h.mult, baseGain: h.gain });
      }

      // 125,000 RPM MGU-H Split Turbocharger Whine
      this.turboOsc = this.ctx.createOscillator();
      this.turboGain = this.ctx.createGain();
      this.turboOsc.type = 'sine';
      this.turboOsc.frequency.value = 3400;
      this.turboGain.gain.value = 0.018;
      this.turboOsc.connect(this.turboGain);
      this.turboGain.connect(this.masterGain);
      this.turboOsc.start();

      // Exhaust turbulent rush / pneumatic wastegate noise buffer
      const bufSize = this.ctx.sampleRate * 2;
      const noiseBuf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseNode = this.ctx.createBufferSource();
      this.noiseNode.buffer = noiseBuf;
      this.noiseNode.loop = true;

      this.noiseFilter = this.ctx.createBiquadFilter();
      this.noiseFilter.type = 'bandpass';
      this.noiseFilter.frequency.value = 1200;
      this.noiseFilter.Q.value = 1.4;

      this.noiseGain = this.ctx.createGain();
      this.noiseGain.gain.value = 0.04;

      this.noiseNode.connect(this.noiseFilter);
      this.noiseFilter.connect(this.noiseGain);
      this.noiseGain.connect(this.masterGain);
      this.noiseNode.start();
    } catch {
      // Safe fallback in headless environments
    }
  }

  toggle(forceState) {
    if (!this.ctx) this.init();
    this.enabled = typeof forceState === 'boolean' ? forceState : !this.enabled;
    if (this.ctx && this.ctx.state === 'suspended' && this.enabled) {
      this.ctx.resume().catch(() => {});
    }
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(this.enabled ? 0.16 : 0.0, now, 0.06);
    }
    return this.enabled;
  }

  update(rpm, dt = 0.016) {
    this.targetRpm = Math.max(3500, Math.min(15000, rpm));
    this.rpm += (this.targetRpm - this.rpm) * Math.min(1.0, dt * 14.0);
    if (!this.ctx || !this.enabled) return;

    const now = this.ctx.currentTime;
    // 4-stroke 6-cylinder fires 3 times per crankshaft revolution
    const f0 = (this.rpm / 60.0) * 3.0;
    const norm = (this.rpm - 3500) / (15000 - 3500);

    for (const item of this.oscBank) {
      item.osc.frequency.setTargetAtTime(f0 * item.mult, now, 0.02);
    }

    if (this.formant1 && this.formant2) {
      this.formant1.frequency.setTargetAtTime(220 + norm * 680, now, 0.03);
      this.formant2.frequency.setTargetAtTime(640 + norm * 1450, now, 0.03);
    }

    if (this.turboOsc && this.turboGain) {
      // 125,000 RPM MGU-H compressor blade passing tone
      this.turboOsc.frequency.setTargetAtTime(2900 + norm * 5600, now, 0.04);
      this.turboGain.gain.setTargetAtTime(0.012 + norm * 0.032, now, 0.04);
    }

    if (this.noiseFilter && this.noiseGain) {
      this.noiseFilter.frequency.setTargetAtTime(900 + norm * 2400, now, 0.04);
      this.noiseGain.gain.setTargetAtTime(0.03 + norm * 0.09, now, 0.04);
    }
  }

  triggerGearshift() {
    if (!this.ctx || !this.enabled || !this.masterGain) return;
    try {
      const now = this.ctx.currentTime;
      // Seamless shift 12ms ignition cut + wastegate bark
      this.masterGain.gain.setValueAtTime(0.03, now);
      this.masterGain.gain.exponentialRampToValueAtTime(0.18, now + 0.045);
    } catch {}
  }
}
