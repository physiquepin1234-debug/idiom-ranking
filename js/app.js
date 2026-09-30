// 화면 전환과 각 화면 그리기
const App = (() => {
  const app = document.getElementById('app');
  let cleanup = null; // 게임 화면을 떠날 때 타이머 등을 정리하는 함수

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function playerLabel(p) {
    return `${esc(p.grade)}-${esc(p.cls)} ${esc(p.nickname)}`;
  }

  function topbar(title, back = '#/home') {
    return `
      <header class="topbar">
        <a class="btn-back" href="${back}" aria-label="뒤로">←</a>
        <h2>${esc(title)}</h2>
        <span class="topbar-spacer"></span>
      </header>`;
  }

  function tabs(items, active) {
    return `<div class="tabs" role="tablist">${items
      .map(([key, label]) => `<button class="tab ${key === active ? 'is-active' : ''}" data-tab="${key}" role="tab">${esc(label)}</button>`)
      .join('')}</div>`;
  }

  function bindTabs(onChange) {
    app.querySelectorAll('.tab').forEach((btn) => btn.addEventListener('click', () => onChange(btn.dataset.tab)));
  }

  function emptyBox(message) {
    return `<div class="empty">${message}</div>`;
  }

  function medal(rank) {
    return rank <= 3 ? `<span class="medal medal-${rank}">${rank}</span>` : `<span class="rank-num">${rank}</span>`;
  }

  // ───────────────── 시작 화면 ─────────────────
  function renderHome() {
    const profile = Store.getProfile();
    const who = profile
      ? `<a class="profile-chip" href="#/profile"><b>${esc(profile.school.name)}</b> · ${playerLabel(profile)} <span class="edit">변경</span></a>`
      : `<a class="profile-chip is-empty" href="#/profile">🏫 학교와 닉네임을 먼저 설정하세요</a>`;

    app.innerHTML = `
      <main class="home">
        <div class="home-hero">
          <p class="home-kicker">우리 몸으로 배우는 관용 표현</p>
          <h1 class="home-title">전국 관용표현<br><span>랭킹전</span></h1>
          ${who}
        </div>
        <a class="btn-start" href="#/game">게임 시작 ▶</a>
        <nav class="home-menu">
          <a class="menu-card" href="#/howto"><span class="icon">📖</span>게임방법</a>
          <a class="menu-card" href="#/practice"><span class="icon">✏️</span>연습모드</a>
          <a class="menu-card" href="#/hall"><span class="icon">🏆</span>명예의 전당</a>
          <a class="menu-card" href="#/school"><span class="icon">🏫</span>우리 학교 랭킹</a>
          <a class="menu-card" href="#/me"><span class="icon">🙋</span>개인별 랭킹</a>
        </nav>
      </main>`;
  }

  // ───────────────── 학교·닉네임 설정 ─────────────────
  const SURNAMES = '김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용';
  const BAD_WORDS = ['씨발', '시발', '병신', '개새', '존나', '좆', '미친', '꺼져', '닥쳐'];

  function looksLikeRealName(nick) {
    return /^[가-힣]{3}$/.test(nick) && SURNAMES.includes(nick[0]);
  }

  function renderProfile(params) {
    const next = params.get('next');
    const saved = Store.getProfile();
    // 같은 태블릿을 여러 학생이 쓰는 경우: 새 학생은 앞 학생의 기록을 이어받지 않도록 따로 등록
    const asNew = !!saved && params.get('new') === '1';
    const profile = asNew ? null : saved;
    let selected = profile ? profile.school : saved ? saved.school : null;
    const newLink = '#/profile?new=1' + (next ? '&next=' + next : '');

    const gradeOptions = [1, 2, 3, 4, 5, 6]
      .map((g) => `<option value="${g}" ${((saved && saved.grade) || 6) == g ? 'selected' : ''}>${g}학년</option>`)
      .join('');
    const classOptions = Array.from({ length: 15 }, (_, i) => i + 1)
      .map((c) => `<option value="${c}" ${((saved && saved.cls) || 1) == c ? 'selected' : ''}>${c}반</option>`)
      .join('');

    let banner = '';
    if (asNew) {
      banner = `<p class="notice">🆕 <b>새 학생</b>으로 등록해요. 앞 학생의 기록은 이어지지 않아요.</p>`;
    } else if (profile) {
      banner = `
        <div class="notice who-now">
          <span>이 기기에 등록된 학생: <b>${playerLabel(profile)}</b><br><small>내가 아니라면 새로 등록하세요.</small></span>
          <a class="btn-secondary" href="${newLink}">다른 학생이에요</a>
        </div>`;
    } else if (next) {
      banner = `<p class="notice">게임 기록을 랭킹에 올리려면 먼저 설정해 주세요.</p>`;
    }

    app.innerHTML = `
      ${topbar(asNew ? '새 학생 등록' : '학교와 닉네임 설정')}
      <main class="page narrow">
        ${banner}
        <section class="card form">
          <label class="label" for="school-q">1. 우리 학교 찾기</label>
          <div class="selected-school" id="selected-school"></div>
          <input id="school-q" class="input" type="search" placeholder="학교 이름을 입력하세요 (예: 부용)" autocomplete="off">
          <ul id="school-results" class="school-results"></ul>
          ${window.SCHOOLS_SAMPLE ? `<p class="hint">※ 지금은 시험용 학교 목록입니다. 목록에 없으면 아래에서 직접 입력하세요.</p>` : ''}

          <label class="label">2. 학년과 반</label>
          <div class="row">
            <select id="grade" class="input">${gradeOptions}</select>
            <select id="cls" class="input">${classOptions}</select>
          </div>

          <label class="label" for="nickname">3. 닉네임</label>
          <input id="nickname" class="input" maxlength="8" placeholder="2~8글자 (실명 금지!)" value="${esc(profile ? profile.nickname : '')}">
          <p class="hint">⚠️ 랭킹에 공개되므로 <b>실명은 쓰지 마세요.</b> 번호(예: 7번)나 별명을 쓰세요.</p>

          <p id="form-error" class="form-error" role="alert"></p>
          <button id="save" class="btn-primary">저장하기</button>
        </section>
      </main>`;

    const q = document.getElementById('school-q');
    const results = document.getElementById('school-results');
    const selectedBox = document.getElementById('selected-school');

    function showSelected() {
      selectedBox.innerHTML = selected
        ? `✅ <b>${esc(selected.name)}</b> <small>${esc(selected.region)}${selected.addr ? ' · ' + esc(selected.addr) : ''}</small>`
        : '<small>아직 선택하지 않았어요</small>';
    }

    function search() {
      const term = q.value.trim().replace(/\s/g, '');
      if (!term) {
        results.innerHTML = '';
        return;
      }
      const found = window.SCHOOLS.filter((s) => s.name.replace(/\s/g, '').includes(term)).slice(0, 30);
      const typedName = term.endsWith('초등학교') ? term : term.replace(/초$/, '') + '초등학교';
      results.innerHTML =
        found
          .map((s, i) => `<li><button data-i="${i}"><b>${esc(s.name)}</b><small>${esc(s.region)} ${esc(s.addr)}</small></button></li>`)
          .join('') + `<li><button data-custom="1" class="custom">✏️ "${esc(typedName)}" 직접 입력하기</button></li>`;
      results.querySelectorAll('button').forEach((btn) =>
        btn.addEventListener('click', () => {
          selected = btn.dataset.custom
            ? { code: 'CUSTOM-' + typedName, name: typedName, region: '직접입력', addr: '' }
            : found[Number(btn.dataset.i)];
          results.innerHTML = '';
          q.value = '';
          showSelected();
        })
      );
    }

    q.addEventListener('input', search);
    showSelected();

    const saveBtn = document.getElementById('save');
    saveBtn.addEventListener('click', async () => {
      const nickname = document.getElementById('nickname').value.trim();
      const error = document.getElementById('form-error');
      if (!selected) return (error.textContent = '학교를 검색해서 선택해 주세요.');
      if (nickname.length < 2) return (error.textContent = '닉네임은 2글자 이상 써 주세요.');
      if (BAD_WORDS.some((w) => nickname.includes(w))) return (error.textContent = '바르고 고운 닉네임을 써 주세요.');
      if (looksLikeRealName(nickname) && !confirm(`"${nickname}"은(는) 실명처럼 보여요.\n실명이 아닌 닉네임이 맞나요?`)) return;

      saveBtn.disabled = true;
      saveBtn.textContent = '저장 중…';
      await Store.saveProfile(
        {
          school: { code: selected.code, name: selected.name, region: selected.region },
          grade: Number(document.getElementById('grade').value),
          cls: Number(document.getElementById('cls').value),
          nickname,
        },
        { asNew }
      );
      location.hash = next ? '#/' + next : '#/home';
    });
  }

  // ───────────────── 게임방법 ─────────────────
  function renderHowTo() {
    app.innerHTML = `
      ${topbar('게임방법')}
      <main class="page narrow">
        <ol class="howto">
          <li><span class="step">1</span><div><b>학교와 닉네임을 설정해요.</b><p>실명 대신 번호나 별명을 써요.</p></div></li>
          <li><span class="step">2</span><div><b>관용표현 10개가 반으로 나뉘어 섞여 나와요.</b><p>왼쪽(A)에는 앞부분, 오른쪽(B)에는 뒷부분이 있어요.</p>
            <div class="howto-demo"><span class="chip-a">발이</span><span class="demo-line"></span><span class="chip-b">넓다</span></div></div></li>
          <li><span class="step">3</span><div><b>손가락으로 선을 그어 짝을 이어요.</b><p>A의 앞부분에서 B의 알맞은 뒷부분까지 끌어서 연결해요.</p></div></li>
          <li><span class="step">4</span><div><b>제한 시간은 1분!</b><p>맞히면 점수를 얻고, 연속으로 맞히면 콤보 보너스가 붙어요.</p></div></li>
          <li><span class="step">5</span><div><b>기록은 랭킹에 올라가요.</b><p>명예의 전당, 우리 학교 랭킹에서 순위를 확인해요.</p></div></li>
        </ol>
        <div class="score-rule card">
          <h3>점수 규칙</h3>
          <ul>
            <li>정답 <b>+${Game.SCORE.correct}점</b></li>
            <li>연속 정답 콤보 보너스 <b>+${Game.SCORE.comboStep}점 × (콤보−1)</b> — 2콤보 +${Game.SCORE.comboStep}, 3콤보 +${Game.SCORE.comboStep * 2} …</li>
            <li>오답 <b>${Game.SCORE.wrong}점</b>, 콤보는 0으로</li>
            <li>10개를 모두 이으면 <b>+${Game.SCORE.clearBonus}점</b> 보너스와 새 문제 10개</li>
          </ul>
          <p class="hint">💡 끌어서 잇기가 어려우면 앞부분과 뒷부분을 차례로 <b>톡, 톡</b> 눌러도 연결돼요.</p>
        </div>
        <div class="actions">
          <a class="btn-secondary" href="#/practice">연습모드로 익히기</a>
          <a class="btn-primary" href="#/game">게임 시작</a>
        </div>
      </main>`;
  }

  // ───────────────── 연습모드 ─────────────────
  function renderPractice() {
    let category = '전체';
    let term = '';

    app.innerHTML = `
      ${topbar('연습모드')}
      <main class="page">
        <div class="practice-head card">
          <div>
            <h3>연습 게임</h3>
            <p class="hint">시간 제한 없이 이어 보고, 맞히면 뜻을 확인해요. 기록은 저장되지 않아요.</p>
          </div>
          <a class="btn-primary" href="#/game?mode=practice">연습 게임 시작 ▶</a>
        </div>
        <p class="lead">아래 카드를 눌러 뜻을 확인해 보세요.</p>
        <div class="practice-tools">
          <input id="practice-q" class="input" type="search" placeholder="표현 또는 뜻 검색">
          <div class="chips" id="chips"></div>
        </div>
        <div class="idiom-grid" id="idiom-grid"></div>
      </main>`;

    const chips = document.getElementById('chips');
    const grid = document.getElementById('idiom-grid');

    function draw() {
      chips.innerHTML = ['전체', ...Idioms.CATEGORIES]
        .map((c) => `<button class="chip ${c === category ? 'is-active' : ''}" data-c="${c}">${c}</button>`)
        .join('');
      chips.querySelectorAll('.chip').forEach((b) =>
        b.addEventListener('click', () => {
          category = b.dataset.c;
          draw();
        })
      );

      const list = Idioms.all.filter(
        (it) =>
          (category === '전체' || Idioms.categoryOf(it) === category) &&
          (!term || it.full.includes(term) || it.meaning.includes(term))
      );
      grid.innerHTML = list.length
        ? list
            .map(
              (it) => `
          <button class="idiom-card" aria-pressed="false">
            <span class="idiom-full"><span class="part-a">${esc(it.a)}</span> <span class="part-b">${esc(it.b)}</span></span>
            <span class="idiom-meaning">${esc(it.meaning)}</span>
          </button>`
            )
            .join('')
        : emptyBox('찾는 표현이 없어요.');
      grid.querySelectorAll('.idiom-card').forEach((card) =>
        card.addEventListener('click', () => {
          const open = card.classList.toggle('is-open');
          card.setAttribute('aria-pressed', String(open));
        })
      );
    }

    document.getElementById('practice-q').addEventListener('input', (e) => {
      term = e.target.value.trim();
      draw();
    });
    draw();
  }

  // ───────────────── 게임 화면 ─────────────────
  function renderGame(params) {
    const mode = params.get('mode') === 'practice' ? 'practice' : 'rank';
    if (mode === 'rank' && !Store.getProfile()) {
      location.hash = '#/profile?next=game';
      return;
    }
    cleanup = Game.start(app, {
      mode,
      onFinish: finishGame,
      onQuit: () => (location.hash = mode === 'practice' ? '#/practice' : '#/home'),
    });
  }

  // ───────────────── 결과 화면 ─────────────────
  let lastResult = null;

  async function finishGame(result) {
    if (result.mode === 'practice') {
      lastResult = result; // 연습 기록은 저장하지 않음
    } else {
      const saved = await Store.submitResult(result);
      lastResult = { ...result, saved, profile: Store.getProfile() };
    }
    location.hash = '#/result';
  }

  // 온라인 자료를 기다리는 동안 다른 화면으로 옮겨 갔는지 확인하는 번호
  let routeSeq = 0;

  function loadingPage(title, back) {
    app.innerHTML = `${topbar(title, back)}<main class="page narrow"><div class="loading">순위를 불러오는 중…</div></main>`;
  }

  const OFFLINE_MSG = '온라인 순위를 불러오지 못했어요.<br>인터넷 연결을 확인하고 다시 들어와 주세요.';

  function reviewList(title, items, kind) {
    if (!items.length) return '';
    return `
      <h3 class="section-title">${title} <small>${items.length}개</small></h3>
      <ul class="review ${kind}">${items
        .map((it) => `<li><b><span class="part-a">${esc(it.a)}</span> <span class="part-b">${esc(it.b)}</span></b><span>${esc(it.meaning)}</span></li>`)
        .join('')}</ul>`;
  }

  async function renderResult() {
    if (!lastResult) {
      location.hash = '#/home';
      return;
    }
    const r = lastResult;
    const practice = r.mode === 'practice';
    let head;

    if (practice) {
      head = `
        <p class="new-best">연습 완료!</p>
        <p class="result-score">${r.correct}<small>개 연결</small></p>
        <div class="result-stats">
          <div><small>연습 점수</small><b>${r.score}</b></div>
          <div><small>최대 콤보</small><b>${r.maxCombo}</b></div>
          <div><small>틀린 횟수</small><b>${r.wrong}</b></div>
          <div><small>정확도</small><b>${r.correct + r.wrong ? Math.round((r.correct / (r.correct + r.wrong)) * 100) : 0}%</b></div>
        </div>`;
    } else {
      const s = r.saved;
      head = `
        ${s.isBest ? '<p class="new-best">🎉 개인 최고 기록!</p>' : ''}
        <p class="result-score">${r.score}<small>점</small></p>
        <div class="result-stats">
          <div><small>맞힌 개수</small><b>${r.correct}</b></div>
          <div><small>최대 콤보</small><b>${r.maxCombo}</b></div>
          <div><small>전국 순위</small><b id="rank-nat">…</b></div>
          <div><small>우리 학교</small><b id="rank-school">…</b></div>
        </div>
        ${
          s.online
            ? s.isBest ? '' : `<p class="hint">순위는 나의 최고 기록(${s.best}점)으로 매겨져요.</p>`
            : '<p class="form-error">⚠️ 인터넷 연결 문제로 전국 랭킹에 올리지 못했어요. (이 기기의 도전 기록에는 남아요)</p>'
        }`;
    }

    app.innerHTML = `
      ${topbar(practice ? '연습 결과' : '게임 결과', practice ? '#/practice' : '#/home')}
      <main class="page narrow">
        <section class="card result">${head}</section>
        <div class="actions">
          ${practice ? '<a class="btn-secondary" href="#/practice">표현 카드 보기</a>' : '<a class="btn-secondary" href="#/hall">명예의 전당</a>'}
          <a class="btn-primary" href="#/game${practice ? '?mode=practice' : ''}">다시 하기</a>
        </div>
        ${reviewList('🔁 헷갈렸던 표현', r.review, 'is-review')}
        ${reviewList('✅ 이번 판에서 맞힌 표현', r.matched, 'is-matched')}
      </main>`;

    if (practice) return;
    const seq = routeSeq;
    let nat = '-';
    let school = '-';
    if (r.saved.online) {
      try {
        const [n, players] = await Promise.all([
          Store.getNationalRank(r.saved.best),
          Store.getSchoolPlayers(r.profile.school.code),
        ]);
        nat = n + '위';
        school = (Ranking.rankOf(players, r.profile.playerId) || '-') + '위';
      } catch (err) {
        console.error(err);
      }
    }
    if (seq !== routeSeq) return;
    document.getElementById('rank-nat').textContent = nat;
    document.getElementById('rank-school').textContent = school;
  }

  // ───────────────── 명예의 전당 (전국) ─────────────────
  async function renderHall(params) {
    const tab = params.get('tab') || 'players';
    const profile = Store.getProfile();
    const seq = routeSeq;
    loadingPage('🏆 명예의 전당');
    let body;

    try {
      if (tab === 'players') body = hallPlayers(await Store.getNationalTop(10), profile);
      else body = hallSchools(await Store.getSchoolsTop(10), profile);
    } catch (err) {
      console.error(err);
      body = emptyBox(OFFLINE_MSG);
    }
    if (seq !== routeSeq) return;

    app.innerHTML = `
      ${topbar('🏆 명예의 전당')}
      <main class="page narrow">
        ${tabs([['players', '전국 TOP 10'], ['schools', '학교 순위']], tab)}
        <p class="hint">학생마다 최고 기록 1개로 순위를 매겨요. 학교 순위는 참가 학생 최고 기록의 평균이며, <b>${Store.MIN_SCHOOL_PLAYERS}명 이상 참가한 학교</b>만 올라가요.</p>
        ${body}
      </main>`;
    bindTabs((t) => (location.hash = '#/hall?tab=' + t));
  }

  function hallPlayers(top, profile) {
    return top.length
        ? `<ol class="rank-list">${top
            .map(
              (p, i) => `
          <li class="${profile && p.playerId === profile.playerId ? 'is-me' : ''}">
            ${medal(i + 1)}
            <span class="who"><b>${esc(p.nickname)}</b><small>${esc(p.school.name)} ${esc(p.grade)}학년 ${esc(p.cls)}반</small></span>
            <span class="pts">${p.score}<small>점</small></span>
          </li>`
            )
            .join('')}</ol>`
        : emptyBox('아직 기록이 없어요.<br>첫 번째 주인공이 되어 보세요!');
  }

  function hallSchools(top, profile) {
    const myKey = profile ? String(profile.school.code).replace(/\//g, '_') : null;
    return top.length
      ? `<ol class="rank-list">${top
          .map(
            (g, i) => `
          <li class="${g.key === myKey ? 'is-me' : ''}">
            ${medal(i + 1)}
            <span class="who"><b>${esc(g.name)}</b><small>${esc(g.region)} · 참가 ${g.count}명</small></span>
            <span class="pts">${g.avg}<small>점 (평균)</small></span>
          </li>`
          )
          .join('')}</ol>`
      : emptyBox(`아직 순위에 오른 학교가 없어요.<br>우리 학교 친구 ${Store.MIN_SCHOOL_PLAYERS}명이 참가하면 학교 순위에 올라가요!`);
  }

  // ───────────────── 우리 학교 랭킹 ─────────────────
  async function renderSchool(params) {
    const profile = Store.getProfile();
    if (!profile) {
      app.innerHTML = `${topbar('🏫 우리 학교 랭킹')}<main class="page narrow">${emptyBox(
        '우리 학교를 먼저 설정해 주세요.<br><a class="btn-primary" href="#/profile">학교 설정하기</a>'
      )}</main>`;
      return;
    }
    const tab = params.get('tab') || 'players';
    const seq = routeSeq;
    loadingPage('🏫 우리 학교 랭킹');
    let list;
    try {
      list = await Store.getSchoolPlayers(profile.school.code);
    } catch (err) {
      console.error(err);
    }
    if (seq !== routeSeq) return;
    let body;

    if (!list) {
      body = emptyBox(OFFLINE_MSG);
    } else if (tab === 'players') {
      body = list.length
        ? `<ol class="rank-list">${list
            .map(
              (p, i) => `
          <li class="${p.playerId === profile.playerId ? 'is-me' : ''}">
            ${medal(i + 1)}
            <span class="who"><b>${esc(p.nickname)}</b><small>${esc(p.grade)}학년 ${esc(p.cls)}반</small></span>
            <span class="pts">${p.score}<small>점</small></span>
          </li>`
            )
            .join('')}</ol>`
        : emptyBox('우리 학교 기록이 아직 없어요.');
    } else {
      const classes = Ranking.classesInSchool(list);
      const myKey = profile.grade + '-' + profile.cls;
      body = classes.length
        ? `<ol class="rank-list">${classes
            .map(
              (g, i) => `
          <li class="${g.key === myKey ? 'is-me' : ''}">
            ${medal(i + 1)}
            <span class="who"><b>${esc(g.label)}</b><small>참가 ${g.count}명</small></span>
            <span class="pts">${g.avg}<small>점 (평균)</small></span>
          </li>`
            )
            .join('')}</ol>`
        : emptyBox('반별 기록이 아직 없어요.');
    }

    app.innerHTML = `
      ${topbar('🏫 우리 학교 랭킹')}
      <main class="page narrow">
        <p class="school-name">${esc(profile.school.name)}</p>
        ${tabs([['players', '학생 순위'], ['classes', '반별 대항전']], tab)}
        ${body}
      </main>`;
    bindTabs((t) => (location.hash = '#/school?tab=' + t));
  }

  // ───────────────── 개인별 랭킹 (내 기록) ─────────────────
  async function renderMe() {
    const profile = Store.getProfile();
    if (!profile) {
      app.innerHTML = `${topbar('🙋 개인별 랭킹')}<main class="page narrow">${emptyBox(
        '닉네임을 먼저 설정해 주세요.<br><a class="btn-primary" href="#/profile">설정하기</a>'
      )}</main>`;
      return;
    }
    const seq = routeSeq;
    loadingPage('🙋 개인별 랭킹');
    const mine = Store.getHistory(profile.playerId);
    let best = mine.reduce((m, r) => Math.max(m, r.score), 0);
    let plays = mine.length;
    let national = null;
    let school = null;
    let offline = false;
    try {
      const player = await Store.getMyPlayer(profile.playerId);
      if (player) {
        best = player.score;
        plays = player.plays;
        const [n, players] = await Promise.all([Store.getNationalRank(best), Store.getSchoolPlayers(profile.school.code)]);
        national = n;
        school = Ranking.rankOf(players, profile.playerId);
      }
    } catch (err) {
      console.error(err);
      offline = true;
    }
    if (seq !== routeSeq) return;

    app.innerHTML = `
      ${topbar('🙋 개인별 랭킹')}
      <main class="page narrow">
        <section class="card me-card">
          <p class="me-name">${esc(profile.nickname)}</p>
          <p class="me-school">${esc(profile.school.name)} ${esc(profile.grade)}학년 ${esc(profile.cls)}반</p>
          <div class="result-stats">
            <div><small>최고 점수</small><b>${best}</b></div>
            <div><small>전국 순위</small><b>${national ? national + '위' : '-'}</b></div>
            <div><small>학교 순위</small><b>${school ? school + '위' : '-'}</b></div>
            <div><small>도전 횟수</small><b>${plays}</b></div>
          </div>
          ${offline ? '<p class="form-error">⚠️ 온라인 순위를 불러오지 못했어요.</p>' : ''}
        </section>
        <h3 class="section-title">나의 도전 기록 <small>이 기기에서 한 기록</small></h3>
        ${
          mine.length
            ? `<ul class="history">${mine
                .slice(0, 30)
                .map((r) => {
                  const d = new Date(r.date);
                  return `<li><span>${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</span>
                    <span>맞힌 ${r.correct}개 · 콤보 ${r.maxCombo}</span><b>${r.score}점</b></li>`;
                })
                .join('')}</ul>`
            : emptyBox('아직 도전 기록이 없어요.<br><a class="btn-primary" href="#/game">첫 도전 하기</a>')
        }
      </main>`;
  }

  // ───────────────── 화면 전환 ─────────────────
  const routes = {
    home: renderHome,
    profile: renderProfile,
    howto: renderHowTo,
    practice: renderPractice,
    game: renderGame,
    result: renderResult,
    hall: renderHall,
    school: renderSchool,
    me: renderMe,
  };

  function route() {
    routeSeq += 1;
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
    const render = routes[path] || renderHome;
    document.body.classList.toggle('is-cyber', path === 'game');
    window.scrollTo(0, 0);
    render(new URLSearchParams(query || ''));
  }

  window.addEventListener('hashchange', route);
  route();

  return { finishGame };
})();
