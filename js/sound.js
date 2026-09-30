// 효과음 (소리 파일 없이 브라우저에서 직접 합성)
const Sound = (() => {
  const KEY_MUTED = 'idiomRanking.muted';
  let ctx = null;
  let muted = false;
  try {
    muted = localStorage.getItem(KEY_MUTED) === '1';
  } catch (e) {}

  // 태블릿은 화면을 터치한 뒤에만 소리가 나므로 START 버튼에서 호출합니다.
  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, start, dur, { type = 'sine', gain = 0.18, slideTo = null } = {}) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  const semi = (base, n) => base * Math.pow(2, n / 12);

  return {
    unlock,
    isMuted: () => muted,
    toggleMute() {
      muted = !muted;
      try {
        localStorage.setItem(KEY_MUTED, muted ? '1' : '0');
      } catch (e) {}
      return muted;
    },
    select() {
      tone(900, 0, 0.05, { gain: 0.07 });
    },
    // 콤보가 이어질수록 음이 한 칸씩 높아집니다.
    correct(combo) {
      const base = semi(660, Math.min(combo - 1, 12) * 2);
      tone(base, 0, 0.1, { type: 'triangle' });
      tone(base * 1.5, 0.07, 0.18, { type: 'triangle' });
      if (combo >= 3) {
        tone(base * 2, 0.15, 0.1, { gain: 0.1 });
        tone(base * 2.5, 0.21, 0.16, { gain: 0.08 });
      }
    },
    wrong() {
      tone(200, 0, 0.28, { type: 'sawtooth', gain: 0.1, slideTo: 80 });
    },
    tick() {
      tone(1300, 0, 0.05, { type: 'square', gain: 0.05 });
    },
    count() {
      tone(520, 0, 0.14, { type: 'square', gain: 0.08 });
    },
    go() {
      tone(1040, 0, 0.35, { type: 'square', gain: 0.1 });
    },
    clear() {
      [0, 4, 7, 12, 16].forEach((n, i) => tone(semi(523, n), i * 0.07, 0.22, { type: 'triangle' }));
    },
    timeUp() {
      [12, 7, 4, 0].forEach((n, i) => tone(semi(392, n), i * 0.13, 0.28, { type: 'square', gain: 0.08 }));
    },
  };
})();
