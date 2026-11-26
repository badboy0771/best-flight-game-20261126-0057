// Synthesised sound, no audio files: an engine hum that follows the throttle, wind noise that
// follows the speed, a chime for a ring and a thud for a crash. The context only starts after
// the player's first gesture, so screenshot runs stay silent.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windGain = null;
  let windFilter = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.14;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 52;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 104;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      // Wind: a looping noise buffer through a band-pass filter.
      const len = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      noise.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      noise.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function tone(freq, when, dur, type, vol) {
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vol, when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  return {
    /** Call from any user gesture; also safe to call every frame. */
    unlock() {
      ensure();
    },
    /** Silence everything (M key); the levels keep updating underneath. */
    setMuted(muted) {
      if (ensure() && master) master.gain.value = muted ? 0 : 0.14;
      this.muted = muted;
    },
    isMuted() {
      return !!this.muted;
    },
    muted: false,
    /** Continuous engine + wind levels from the live state. */
    update(state) {
      if (!ctx) return;
      const t = ctx.currentTime;
      engineOsc.frequency.setTargetAtTime(48 + state.throttle * 55, t, 0.1);
      engineOsc2.frequency.setTargetAtTime(96 + state.throttle * 110, t, 0.1);
      engineGain.gain.setTargetAtTime(0.05 + state.throttle * 0.11, t, 0.1);
      windGain.gain.setTargetAtTime(Math.max(0, (state.speed - 30) / 90) * 0.09, t, 0.15);
      windFilter.frequency.setTargetAtTime(400 + state.speed * 9, t, 0.15);
    },
    ring() {
      if (!ctx) return;
      const t = ctx.currentTime;
      tone(880, t, 0.35, 'sine', 0.5);
      tone(1318, t + 0.09, 0.45, 'sine', 0.4);
    },
    crash() {
      if (!ctx) return;
      const t = ctx.currentTime;
      tone(160, t, 0.5, 'sine', 0.7);
      tone(70, t + 0.05, 0.7, 'sine', 0.7);
    },
    land() {
      if (!ctx) return;
      const t = ctx.currentTime;
      tone(523, t, 0.3, 'sine', 0.45);
      tone(659, t + 0.12, 0.3, 'sine', 0.45);
      tone(784, t + 0.24, 0.5, 'sine', 0.45);
    },
  };
}
