interface AudioUpdate {
  playing: boolean;
  /** 0..1 player speed. */
  speedFrac: number;
  boosting: boolean;
  /** 0..1 pursuit siren loudness. */
  sirenLevel: number;
}

/**
 * All-synthesized game audio (no asset files): an engine tone that pitches with
 * speed, a police siren that fades in during a pursuit, and a soft title pad,
 * plus a mute toggle. Everything is null-guarded so audio never breaks the game.
 *
 * WebAudio needs a user gesture to start, so {@link start} is called from a
 * keypress and is safe to call repeatedly.
 */
export class GameAudio {
  muted = false;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private sirenGain: GainNode | null = null;
  private padGain: GainNode | null = null;
  /** A second of white noise, reused for every radio squelch (#76). */
  private noise: AudioBuffer | null = null;

  start(): void {
    try {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') void this.ctx.resume();
        return;
      }
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      this.master = master;

      // engine: a sawtooth through a lowpass — a hum that rises with speed
      const engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 900;
      const engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(lowpass).connect(engineGain).connect(master);
      engineOsc.start();
      this.engineOsc = engineOsc;
      this.engineGain = engineGain;

      // siren: a square tone warbled by an LFO on its pitch
      const sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 820;
      const sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 4;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 120;
      lfo.connect(lfoDepth).connect(sirenOsc.frequency);
      sirenOsc.connect(sirenGain).connect(master);
      sirenOsc.start();
      lfo.start();
      this.sirenGain = sirenGain;

      // title pad: two quiet detuned sines for menu mood
      const padGain = ctx.createGain();
      padGain.gain.value = 0;
      padGain.connect(master);
      for (const freq of [110, 164.8]) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.connect(padGain);
        osc.start();
      }
      this.padGain = padGain;

      // One buffer of noise, made once and replayed. Generating a second of it
      // per callout would allocate 44 000 floats in the middle of a pursuit.
      const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      this.noise = noise;
    } catch {
      this.ctx = null;
    }
  }

  update(u: AudioUpdate): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;

    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, t, 0.05);

    if (this.engineOsc && this.engineGain) {
      const freq = 55 + u.speedFrac * 210 + (u.boosting ? 45 : 0);
      this.engineOsc.frequency.setTargetAtTime(freq, t, 0.06);
      const vol = u.playing ? 0.04 + u.speedFrac * 0.05 : 0.015;
      this.engineGain.gain.setTargetAtTime(vol, t, 0.1);
    }
    if (this.sirenGain) {
      this.sirenGain.gain.setTargetAtTime(u.playing ? u.sirenLevel * 0.05 : 0, t, 0.15);
    }
    if (this.padGain) {
      this.padGain.gain.setTargetAtTime(u.playing ? 0 : 0.03, t, 0.4);
    }
  }

  /**
   * The squelch under a radio callout (#76).
   *
   * A short band-passed burst of noise with a hard attack and a quick decay,
   * which is what a radio keying up sounds like. No speech: the line itself is
   * on screen, and voice assets are a production this project does not have.
   */
  squelch(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.noise || this.muted) return;

    try {
      const source = ctx.createBufferSource();
      source.buffer = this.noise;

      // Narrow and high: a wide-open burst of noise is a hiss, and a radio is
      // a voice band with everything either side of it thrown away.
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1600;
      band.Q.value = 3.5;

      const gain = ctx.createGain();
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.09, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

      source.connect(band).connect(gain).connect(master);
      source.start(t);
      source.stop(t + 0.2);
    } catch {
      // A squelch that fails is a squelch nobody hears; it must never be a
      // pursuit that stops.
    }
  }

  toggleMute(): void {
    this.muted = !this.muted;
  }
}
