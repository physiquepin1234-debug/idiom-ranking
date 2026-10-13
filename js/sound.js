// 효과음과 배경음악 (소리 파일 없이 브라우저에서 직접 합성)
const Sound = (() => {
  const KEY_MUTED = 'idiomRanking.muted';
  const BGM_VOLUME = 0.3; // 효과음보다 작게
  let ctx = null;
  let master = null; // 전체 음량 (음소거 스위치)
  let sfxBus = null; // 효과음
  let bgmBus = null; // 배경음악
  let noiseBuf = null;
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
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.connect(master);
      bgmBus = ctx.createGain();
      bgmBus.gain.value = BGM_VOLUME;
      bgmBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  // at: 재생 시각(생략하면 지금), start: 그로부터 몇 초 뒤
  function tone(freq, start, dur, { type = 'sine', gain = 0.18, slideTo = null, at = null, bus = null, lowpass = null } = {}) {
    if (!ctx) return;
    const t0 = (at ?? ctx.currentTime) + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let out = osc;
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      out = out.connect(f);
    }
    out.connect(g).connect(bus || sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // 잡음(드럼·바람 소리용). sweepTo 를 주면 필터 주파수가 그쪽으로 이동
  function noise(at, dur, { gain = 0.2, filter = 'highpass', freq = 6000, sweepTo = null, bus = null, rise = false } = {}) {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, at);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
    const g = ctx.createGain();
    if (rise) {
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + dur * 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    } else {
      g.gain.setValueAtTime(gain, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    }
    src.connect(f).connect(g).connect(bus || sfxBus);
    src.start(at);
    src.stop(at + dur + 0.02);
  }

  const semi = (base, n) => base * Math.pow(2, n / 12);
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // ───── 배경음악: 4마디 반복 신스 비트 (Am - F - C - G) ─────
  const PROGRESSION = [
    [57, 60, 64], // Am
    [53, 57, 60], // F
    [48, 52, 55], // C
    [55, 59, 62], // G
  ];
  const ARP = [0, 1, 2, 1];
  const LEAD = [76, null, 72, null, 74, null, 76, 79, null, 76, null, 72, 74, null, 71, null]; // 2마디에 한 번
  let bgm = null; // { timer, step, nextTime, bpm, transpose, hurry }

  function kick(t) {
    tone(150, 0, 0.18, { at: t, gain: 0.55, slideTo: 45, bus: bgmBus });
  }

  function snare(t) {
    noise(t, 0.14, { filter: 'bandpass', freq: 1800, gain: 0.3, bus: bgmBus });
    tone(190, 0, 0.08, { at: t, type: 'triangle', gain: 0.12, bus: bgmBus });
  }

  function hat(t, gain) {
    noise(t, 0.035, { filter: 'highpass', freq: 7500, gain, bus: bgmBus });
  }

  function scheduleStep(step, t) {
    const i = step % 16; // 한 마디 = 16칸
    const bar = Math.floor(step / 16) % 4;
    const chord = PROGRESSION[bar].map((n) => n + bgm.transpose);
    const stepDur = 60 / bgm.bpm / 4;

    if (i % 4 === 0) kick(t);
    if (i === 4 || i === 12) snare(t);
    if (bgm.hurry && i === 14) snare(t); // 마지막 10초: 드럼을 더 몰아침
    if (i % 2 === 1) hat(t, 0.07);
    else if (bgm.hurry) hat(t, 0.04);

    // 베이스: 8분음표로 근음과 옥타브를 오가며 통통 튀게
    if (i % 2 === 0) {
      const n = chord[0] - 24 + (i % 4 === 2 ? 12 : 0);
      tone(midi(n), 0, stepDur * 1.7, { at: t, type: 'sawtooth', gain: 0.2, lowpass: 900, bus: bgmBus });
    }
    // 아르페지오: 16분음표로 화음을 쪼개서
    const arp = chord[ARP[i % 4]] + (i >= 8 ? 12 : 0);
    tone(midi(arp), 0, stepDur * 0.9, { at: t, type: 'square', gain: 0.045, lowpass: 3000, bus: bgmBus });
    // 멜로디: 홀수 마디마다
    const lead = bar % 2 === 1 ? LEAD[i] : null;
    if (lead) tone(midi(lead + bgm.transpose), 0, stepDur * 1.8, { at: t, type: 'triangle', gain: 0.09, bus: bgmBus });
  }

  function bgmTick() {
    if (!bgm) return;
    // 0.15초 앞까지 미리 예약해서 박자가 흔들리지 않게
    while (bgm.nextTime < ctx.currentTime + 0.15) {
      scheduleStep(bgm.step, bgm.nextTime);
      bgm.nextTime += 60 / bgm.bpm / 4;
      bgm.step += 1;
    }
  }

  function startBgm() {
    if (!ctx || bgm) return;
    bgmBus.gain.cancelScheduledValues(ctx.currentTime);
    bgmBus.gain.setValueAtTime(BGM_VOLUME, ctx.currentTime);
    bgm = { step: 0, nextTime: ctx.currentTime + 0.05, bpm: 136, transpose: 0, hurry: false };
    bgmTick();
    bgm.timer = setInterval(bgmTick, 25);
  }

  function stopBgm() {
    if (!bgm) return;
    clearInterval(bgm.timer);
    bgm = null;
    // 이미 예약된 음은 짧게 줄여서 끝냄
    bgmBus.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
  }

  return {
    unlock,
    isMuted: () => muted,
    toggleMute() {
      muted = !muted;
      try {
        localStorage.setItem(KEY_MUTED, muted ? '1' : '0');
      } catch (e) {}
      if (master) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
      return muted;
    },

    startBgm,
    stopBgm,
    // 마지막 10초: 빨라지고 드럼이 촘촘해짐
    bgmHurry() {
      if (bgm) {
        bgm.hurry = true;
        bgm.bpm = 160;
      }
    },
    // 라운드가 올라갈수록 반음씩 높아짐 (최대 5)
    bgmLevel(round) {
      if (bgm) bgm.transpose = Math.min(round - 1, 5);
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
    // 새 라운드 진입: 휘익 올라가는 바람 소리 + 힘찬 화음
    roundStart() {
      if (!ctx) return;
      const t = ctx.currentTime;
      noise(t, 0.55, { filter: 'bandpass', freq: 400, sweepTo: 5000, gain: 0.25, rise: true });
      tone(220, 0, 0.5, { type: 'sawtooth', gain: 0.06, slideTo: 880, lowpass: 2500 });
      [0, 7, 12, 16].forEach((n) => tone(semi(440, n), 0.52, 0.4, { type: 'square', gain: 0.06, lowpass: 4000 }));
      tone(110, 0.52, 0.3, { gain: 0.3, slideTo: 55 });
    },
    timeUp() {
      [12, 7, 4, 0].forEach((n, i) => tone(semi(392, n), i * 0.13, 0.28, { type: 'square', gain: 0.08 }));
    },
  };
})();
