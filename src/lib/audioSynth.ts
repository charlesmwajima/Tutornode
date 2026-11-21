// Zero-dependency Web Audio synthesizer for TutorNode classroom feedback & subtle focus ambience.

let sharedAudioCtx: AudioContext | null = null;
let ambientOscillators: OscillatorNode[] = [];
let ambientGain: GainNode | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new Ctx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function playClassroomChime(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5 - E5 - G5 soft chord

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);

      gain.gain.setValueAtTime(0.0001, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.06, now + idx * 0.08 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.55);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.6);
    });
  } catch {
    // Audio playback silently ignored if blocked before user gesture
  }
}

export function startAmbientFocusSound(): boolean {
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;

    stopAmbientFocusSound();

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    masterGain.gain.exponentialRampToValueAtTime(0.018, ctx.currentTime + 1.2);
    masterGain.connect(ctx.destination);

    // Warm soft harmonic interval (A2 + E3)
    const freqs = [110, 164.81];
    ambientOscillators = freqs.map((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.connect(masterGain);
      osc.start();
      return osc;
    });
    ambientGain = masterGain;
    return true;
  } catch {
    return false;
  }
}

export function stopAmbientFocusSound(): void {
  try {
    if (ambientGain && sharedAudioCtx) {
      ambientGain.gain.setTargetAtTime(0.0001, sharedAudioCtx.currentTime, 0.25);
    }
    const oldOscs = ambientOscillators;
    ambientOscillators = [];
    setTimeout(() => {
      oldOscs.forEach((osc) => {
        try {
          osc.stop();
          osc.disconnect();
        } catch {
          // Ignore already stopped oscillator
        }
      });
    }, 300);
  } catch {
    ambientOscillators = [];
  }
}
