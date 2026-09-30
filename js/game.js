// 게임 진행: 흩어진 단어 배치, 선 긋기(드래그/두 번 탭), 1분 타이머, 점수·콤보
const Game = (() => {
  const TIME_LIMIT = 60; // 초
  const ROUND_SIZE = 10;
  const SCORE = { correct: 10, comboStep: 5, wrong: -3, clearBonus: 20 };
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  // mode: 'rank'(1분, 기록 저장) | 'practice'(시간 제한 없음)
  // onFinish(result): 게임이 끝났을 때, onQuit(): 중간에 그만뒀을 때
  function start(root, { mode = 'rank', onFinish, onQuit }) {
    const practice = mode === 'practice';
    const state = { score: 0, combo: 0, maxCombo: 0, correct: 0, wrong: 0, matched: [], review: new Map(), used: new Set() };
    let playing = false;
    let destroyed = false;
    let clockId = 0;
    let startAt = 0;
    let lastSec = null;
    let nodes = []; // { el, side, item, cell, jx, jy }
    let selected = null;
    let drag = null;
    let lineSeq = 0;
    let toastTimer = 0;
    const timers = new Set();

    function later(fn, ms) {
      const id = setTimeout(() => {
        timers.delete(id);
        if (!destroyed) fn();
      }, ms);
      timers.add(id);
      return id;
    }

    root.innerHTML = `
      <main class="cyber">
        <div class="cy-grid" aria-hidden="true"></div>
        <header class="cy-hud" id="cy-hud">
          <button class="cy-btn" id="cy-quit" aria-label="그만하기">✕</button>
          <div class="cy-stat cy-time"><small>TIME</small><b id="cy-time">${practice ? '∞' : TIME_LIMIT}</b></div>
          <div class="cy-stat"><small>SCORE</small><b id="cy-score">0</b></div>
          <div class="cy-stat"><small>COMBO</small><b id="cy-combo">0</b></div>
          <div class="cy-stat"><small>LINKED</small><b id="cy-correct">0</b></div>
          <button class="cy-btn" id="cy-mute" aria-label="소리 켜기/끄기">${Sound.isMuted() ? '🔇' : '🔊'}</button>
        </header>
        <div class="cy-timebar"><i id="cy-bar"></i></div>

        <section class="cy-board" id="cy-board">
          <span class="cy-zone cy-zone-a">◢ A // 앞부분</span>
          <span class="cy-zone cy-zone-b">B // 뒷부분 ◣</span>
          <i class="cy-divider" aria-hidden="true"></i>
          <svg class="cy-svg" id="cy-svg" aria-hidden="true">
            <defs>
              <filter id="cy-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3.5" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            <g id="cy-lines"></g>
            <line id="cy-drag" class="cy-drag" x1="0" y1="0" x2="0" y2="0"/>
          </svg>
          <div class="cy-toast" id="cy-toast" role="status"></div>
        </section>

        <div class="cy-overlay" id="cy-overlay">
          <div class="cy-panel">
            <p class="cy-kicker">IDIOM LINK // ${practice ? 'PRACTICE MODE' : 'RANKED MATCH'}</p>
            <h2 class="cy-title">READY?</h2>
            <p>${practice ? '시간 제한 없이 연습해요. 맞히면 뜻이 나와요.' : '1분 동안 최대한 많이 이어 보세요!'}</p>
            <ul class="cy-rules">
              <li>앞부분(A)에서 뒷부분(B)으로 <b>끌어서 연결</b> (또는 하나씩 <b>톡, 톡</b>)</li>
              <li>정답 <b>+${SCORE.correct}</b> · 연속 콤보 <b>+${SCORE.comboStep}씩 추가</b> · 오답 <b>${SCORE.wrong}</b></li>
              <li>10개를 모두 이으면 <b>+${SCORE.clearBonus}</b> 보너스와 새 문제!</li>
            </ul>
            <button class="cy-start" id="cy-start">START</button>
          </div>
        </div>
      </main>`;

    const $ = (id) => root.querySelector('#' + id);
    const board = $('cy-board');
    const linesG = $('cy-lines');
    const dragLine = $('cy-drag');
    const overlay = $('cy-overlay');
    const toastEl = $('cy-toast');
    const hud = $('cy-hud');

    // ───── 배치: 각 편(A/B)을 칸으로 나눈 뒤, 칸 안에서 무작위 위치·기울기 ─────
    function newRound() {
      let pick = Idioms.pickRound(ROUND_SIZE, state.used);
      if (pick.length < ROUND_SIZE) {
        state.used.clear();
        pick = Idioms.pickRound(ROUND_SIZE, state.used);
      }
      pick.forEach((it) => state.used.add(it.id));

      nodes.forEach((n) => n.el.remove());
      nodes = [];
      for (const side of ['a', 'b']) {
        const cells = Idioms.shuffle([...Array(pick.length).keys()]);
        Idioms.shuffle(pick).forEach((item, i) => {
          const el = document.createElement('button');
          el.type = 'button';
          el.className = `cy-node side-${side}`;
          el.innerHTML = `<span>${esc(side === 'a' ? item.a : item.b)}</span>`;
          el.style.setProperty('--rot', (Math.random() * 12 - 6).toFixed(1) + 'deg');
          el.style.setProperty('--float', (-Math.random() * 4).toFixed(2) + 's');
          el.style.setProperty('--appear', (i * 0.05 + (side === 'b' ? 0.025 : 0)).toFixed(3) + 's');
          board.appendChild(el);
          const node = { el, side, item, cell: cells[i], jx: Math.random(), jy: Math.random() };
          el._node = node;
          nodes.push(node);
        });
      }
      layout();
    }

    function layout() {
      const W = board.clientWidth;
      const H = board.clientHeight;
      const top = 30;
      const pad = 6;
      const channel = Math.max(48, W * 0.13); // 가운데 선 긋는 공간
      const zoneW = (W - channel) / 2 - pad;
      const cols = zoneW >= 380 ? 2 : 1;
      const rows = Math.ceil(ROUND_SIZE / cols);
      const cellW = zoneW / cols;
      const cellH = (H - top - pad) / rows;
      for (const n of nodes) {
        const zoneX = n.side === 'a' ? pad : W - pad - zoneW;
        const col = n.cell % cols;
        const row = Math.floor(n.cell / cols);
        n.el.style.maxWidth = cellW - 14 + 'px';
        const w = n.el.offsetWidth;
        const h = n.el.offsetHeight;
        n.el.style.left = zoneX + col * cellW + n.jx * Math.max(0, cellW - w) + 'px';
        n.el.style.top = top + row * cellH + n.jy * Math.max(0, cellH - h) + 'px';
      }
    }

    // ───── 좌표·선 ─────
    function center(el) {
      const r = el.getBoundingClientRect();
      const b = board.getBoundingClientRect();
      return { x: r.left + r.width / 2 - b.left, y: r.top + r.height / 2 - b.top };
    }

    function pointOf(e) {
      const b = board.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    }

    function setLine(line, p1, p2) {
      line.setAttribute('x1', p1.x);
      line.setAttribute('y1', p1.y);
      line.setAttribute('x2', p2.x);
      line.setAttribute('y2', p2.y);
    }

    // 선 색이 A(청록)→B(분홍)로 이어지도록 선마다 그라데이션을 만듭니다.
    function addLine(pa, pb, kind) {
      const g = svgEl('g', { class: 'cy-link ' + kind });
      const id = 'cy-grad-' + ++lineSeq;
      const grad = svgEl('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y });
      grad.append(svgEl('stop', { offset: '0', class: 'stop-a' }), svgEl('stop', { offset: '1', class: 'stop-b' }));
      const line = svgEl('line', { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, stroke: `url(#${id})`, filter: 'url(#cy-glow)' });
      g.append(grad, line);
      linesG.appendChild(g);
      return g;
    }

    function floatText(text, p, kind) {
      const el = document.createElement('div');
      el.className = 'cy-pop ' + kind;
      el.textContent = text;
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      board.appendChild(el);
      later(() => el.remove(), 900);
    }

    function comboFlash(combo) {
      const el = document.createElement('div');
      el.className = 'cy-combo';
      el.innerHTML = `<b data-text="${combo} COMBO">${combo} COMBO</b><small>+${SCORE.comboStep * (combo - 1)} BONUS</small>`;
      board.appendChild(el);
      later(() => el.remove(), 900);
    }

    function bigFlash(html, ms = 1000) {
      const el = document.createElement('div');
      el.className = 'cy-flash';
      el.innerHTML = html;
      board.appendChild(el);
      later(() => el.remove(), ms);
    }

    function toast(idiom) {
      toastEl.innerHTML = `<b>${esc(idiom.full)}</b><span>${esc(idiom.meaning)}</span>`;
      toastEl.classList.remove('show');
      void toastEl.offsetWidth;
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = later(() => toastEl.classList.remove('show'), practice ? 2800 : 1600);
    }

    function updateHud(bump) {
      $('cy-score').textContent = state.score;
      $('cy-combo').textContent = state.combo;
      $('cy-correct').textContent = state.correct;
      if (bump) {
        const s = $('cy-score').parentElement;
        s.classList.remove('bump');
        void s.offsetWidth;
        s.classList.add('bump');
      }
    }

    // ───── 정답 판정 ─────
    function attempt(n1, n2) {
      const a = n1.side === 'a' ? n1 : n2;
      const b = n1.side === 'a' ? n2 : n1;
      const pa = center(a.el);
      const pb = center(b.el);
      const idiom = a.item.id === b.item.id ? a.item : Idioms.findPair(a.item.a, b.item.b);
      if (idiom) onCorrect(a, b, pa, pb, idiom);
      else onWrong(a, b, pa, pb);
    }

    function onCorrect(a, b, pa, pb, idiom) {
      state.combo += 1;
      state.maxCombo = Math.max(state.maxCombo, state.combo);
      const gained = SCORE.correct + SCORE.comboStep * (state.combo - 1);
      state.score += gained;
      state.correct += 1;
      state.matched.push(idiom);

      nodes = nodes.filter((n) => n !== a && n !== b);
      a.el.classList.add('done');
      b.el.classList.add('done');
      const link = addLine(pa, pb, 'ok');
      later(() => link.remove(), 750);
      later(() => {
        a.el.remove();
        b.el.remove();
      }, 650);

      floatText('+' + gained, { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }, 'plus');
      if (state.combo >= 2) comboFlash(state.combo);
      toast(idiom);
      Sound.correct(state.combo);
      updateHud(true);

      if (!nodes.length) later(roundClear, 450);
    }

    function onWrong(a, b, pa, pb) {
      state.combo = 0;
      state.score = Math.max(0, state.score + SCORE.wrong);
      state.wrong += 1;
      state.review.set(a.item.id, a.item);
      state.review.set(b.item.id, b.item);

      const link = addLine(pa, pb, 'bad');
      later(() => link.remove(), 450);
      for (const n of [a, b]) {
        n.el.classList.remove('shake');
        void n.el.offsetWidth;
        n.el.classList.add('shake');
      }
      floatText(String(SCORE.wrong), { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }, 'minus');
      board.classList.remove('glitch');
      void board.offsetWidth;
      board.classList.add('glitch');
      Sound.wrong();
      updateHud(false);
    }

    function roundClear() {
      if (!playing) return;
      state.score += SCORE.clearBonus;
      updateHud(true);
      Sound.clear();
      bigFlash(`<b data-text="ROUND CLEAR">ROUND CLEAR</b><small>+${SCORE.clearBonus} BONUS</small>`, 1000);
      later(() => playing && newRound(), 900);
    }

    // ───── 입력: 드래그로 잇기 + 두 번 탭으로 잇기 ─────
    function nodeAt(x, y) {
      const el = document.elementFromPoint(x, y);
      const nodeEl = el && el.closest('.cy-node');
      return nodeEl && !nodeEl.classList.contains('done') ? nodeEl._node : null;
    }

    function setSelected(node) {
      if (selected) selected.el.classList.remove('active');
      selected = node;
      if (selected) selected.el.classList.add('active');
    }

    function clearHover() {
      board.querySelectorAll('.cy-node.hover').forEach((el) => el.classList.remove('hover'));
    }

    board.addEventListener('pointerdown', (e) => {
      if (!playing || drag) return;
      const node = nodeAt(e.clientX, e.clientY);
      if (!node) {
        setSelected(null);
        return;
      }
      e.preventDefault();
      try {
        board.setPointerCapture(e.pointerId); // 손가락이 판 밖으로 나가도 선을 계속 그리도록
      } catch (err) {}
      drag = { node, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      node.el.classList.add('active');
      dragLine.setAttribute('class', 'cy-drag side-' + node.side);
      Sound.select();
    });

    board.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 12) {
        drag.moved = true;
        dragLine.classList.add('show');
      }
      if (!drag.moved) return;
      setLine(dragLine, center(drag.node.el), pointOf(e));
      clearHover();
      const over = nodeAt(e.clientX, e.clientY);
      if (over && over.side !== drag.node.side) over.el.classList.add('hover');
    });

    function endDrag(e, cancelled) {
      if (!drag || e.pointerId !== drag.id) return;
      const from = drag.node;
      dragLine.classList.remove('show');
      clearHover();
      if (cancelled || !playing) {
        if (from !== selected) from.el.classList.remove('active');
      } else if (drag.moved) {
        from.el.classList.remove('active');
        const target = nodeAt(e.clientX, e.clientY);
        if (target && target.side !== from.side) {
          setSelected(null);
          attempt(from, target);
        } else if (from === selected) {
          setSelected(null);
        }
      } else if (selected && selected !== from && selected.side !== from.side) {
        // 톡, 톡: 먼저 고른 것과 반대편을 누르면 연결
        const first = selected;
        setSelected(null);
        from.el.classList.remove('active');
        attempt(first, from);
      } else if (selected === from) {
        setSelected(null);
      } else {
        setSelected(from);
      }
      drag = null;
    }
    board.addEventListener('pointerup', (e) => endDrag(e, false));
    board.addEventListener('pointercancel', (e) => endDrag(e, true));

    // ───── 시간 (화면이 가려져도 실제 흐른 시간으로 계산) ─────
    function startClock() {
      clearInterval(clockId);
      if (!practice) clockId = setInterval(tick, 100);
    }

    function tick() {
      if (!playing) return;
      const left = Math.max(0, TIME_LIMIT - (performance.now() - startAt) / 1000);
      const sec = Math.ceil(left);
      $('cy-time').textContent = sec;
      $('cy-bar').style.transform = `scaleX(${left / TIME_LIMIT})`;
      if (sec <= 10 && sec > 0 && sec !== lastSec) {
        lastSec = sec;
        hud.classList.add('low');
        Sound.tick();
      }
      if (left <= 0) timeUp();
    }

    function stopInput() {
      playing = false;
      clearInterval(clockId);
      setSelected(null);
      drag = null;
      dragLine.classList.remove('show');
    }

    function result() {
      return {
        mode,
        score: state.score,
        maxCombo: state.maxCombo,
        correct: state.correct,
        wrong: state.wrong,
        matched: state.matched,
        review: [...state.review.values()],
      };
    }

    function timeUp() {
      stopInput();
      Sound.timeUp();
      bigFlash('<b data-text="TIME UP">TIME UP</b>', 1600);
      later(() => onFinish(result()), 1500);
    }

    function begin() {
      Sound.unlock();
      const panel = overlay.querySelector('.cy-panel');
      const steps = ['3', '2', '1', 'GO!'];
      steps.forEach((txt, i) =>
        later(() => {
          panel.innerHTML = `<div class="cy-count" data-text="${txt}">${txt}</div>`;
          if (txt === 'GO!') Sound.go();
          else Sound.count();
        }, i * 650)
      );
      later(() => {
        overlay.classList.add('hide');
        newRound();
        playing = true;
        startAt = performance.now();
        startClock();
      }, steps.length * 650);
    }

    $('cy-start').addEventListener('click', begin, { once: true });

    $('cy-mute').addEventListener('click', (e) => {
      e.currentTarget.textContent = Sound.toggleMute() ? '🔇' : '🔊';
    });

    $('cy-quit').addEventListener('click', () => {
      if (!playing) return onQuit();
      if (practice) {
        stopInput();
        return onFinish(result());
      }
      // 확인창이 떠 있는 동안 시간을 멈춥니다.
      const pausedAt = performance.now();
      playing = false;
      clearInterval(clockId);
      if (confirm('지금 그만두면 기록이 저장되지 않아요.\n그만둘까요?')) return onQuit();
      startAt += performance.now() - pausedAt;
      playing = true;
      startClock();
    });

    const onResize = () => layout();
    window.addEventListener('resize', onResize);

    // 화면을 떠날 때 정리
    return function stop() {
      destroyed = true;
      playing = false;
      clearInterval(clockId);
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', onResize);
    };
  }

  return { start, TIME_LIMIT, ROUND_SIZE, SCORE };
})();
