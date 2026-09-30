// 데이터 저장소
// - 학생 프로필과 나의 도전 기록: 이 기기에 저장
// - 학생별 최고 기록과 학교 합계: Firebase(Firestore)에 저장해서 전국이 함께 봅니다.
//   학생은 로그인 없이 익명으로 자동 접속합니다.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, collection, query, where, orderBy, limit,
  getDoc, getDocs, getCountFromServer, runTransaction, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const KEY_PROFILE = 'idiomRanking.profile';
const KEY_HISTORY = 'idiomRanking.history';

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// 익명 로그인이 끝나면 uid 를 돌려주는 약속
const ready = new Promise((resolve, reject) => {
  const stop = onAuthStateChanged(auth, (user) => {
    if (user) {
      stop();
      resolve(user.uid);
    }
  });
  signInAnonymously(auth).catch((err) => {
    stop();
    reject(err);
  });
});
ready.catch((err) => console.error('익명 로그인 실패', err));
// 순위 보기는 로그인 없이도 되므로, 로그인이 실패해도 기다림만 끝나면 진행
const readReady = ready.catch(() => null);

// ───── 기기 저장 ─────
function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Firestore 문서 이름에 쓸 수 없는 '/' 를 바꿉니다.
function schoolDocId(code) {
  return String(code).replace(/\//g, '_');
}

// ───── Firestore 문서 ↔ 앱에서 쓰는 모양 ─────
function toPlayer(snap) {
  const d = snap.data();
  return {
    playerId: snap.id,
    nickname: d.nickname,
    school: { code: d.schoolCode, name: d.schoolName, region: d.schoolRegion },
    grade: d.grade,
    cls: d.cls,
    score: d.bestScore,
    maxCombo: d.bestCombo,
    plays: d.plays,
  };
}

function playerFields(profile) {
  return {
    nickname: profile.nickname,
    schoolCode: profile.school.code,
    schoolName: profile.school.name,
    schoolRegion: profile.school.region || '',
    grade: profile.grade,
    cls: profile.cls,
  };
}

function schoolData(school, total, count) {
  return {
    name: school.name,
    region: school.region || '',
    total,
    count,
    avg: count ? Math.round(total / count) : 0,
    updatedAt: serverTimestamp(),
  };
}

class ForeignPlayerError extends Error {}

// 게임 결과를 전국 기록에 반영: 최고 기록 갱신, 학교 합계 갱신, 기록 1건 추가
async function pushResult(uid, profile, raw) {
  const result = { ...raw, score: Math.min(raw.score, 3000) }; // 보안 규칙의 점수 상한
  const pRef = doc(db, 'players', profile.playerId);
  const sRef = doc(db, 'schools', schoolDocId(profile.school.code));
  return runTransaction(db, async (tx) => {
    const pSnap = await tx.get(pRef);
    const sSnap = await tx.get(sRef);
    const prev = pSnap.exists() ? pSnap.data() : null;
    if (prev && prev.uid !== uid) throw new ForeignPlayerError();

    const isBest = !prev || result.score > prev.bestScore;
    const best = prev ? Math.max(prev.bestScore, result.score) : result.score;
    tx.set(pRef, {
      uid,
      ...playerFields(profile),
      bestScore: best,
      bestCombo: isBest ? result.maxCombo : prev.bestCombo,
      bestCorrect: isBest ? result.correct : prev.bestCorrect,
      plays: (prev ? prev.plays : 0) + 1,
      lastPlayAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (isBest) {
      const s = sSnap.exists() ? sSnap.data() : { total: 0, count: 0 };
      const count = s.count + (prev ? 0 : 1);
      const total = s.total + best - (prev ? prev.bestScore : 0);
      tx.set(sRef, schoolData(profile.school, total, count));
    }

    tx.set(doc(collection(db, 'records')), {
      uid,
      playerId: profile.playerId,
      schoolCode: profile.school.code,
      score: result.score,
      maxCombo: result.maxCombo,
      correct: result.correct,
      wrong: result.wrong,
      createdAt: serverTimestamp(),
    });
    return { isBest, best };
  });
}

// 이미 전국 기록이 있는 학생이 학교·닉네임을 바꾸면 온라인 기록도 맞춰 줍니다.
async function syncProfile(uid, profile) {
  const pRef = doc(db, 'players', profile.playerId);
  await runTransaction(db, async (tx) => {
    const pSnap = await tx.get(pRef);
    if (!pSnap.exists() || pSnap.data().uid !== uid) return;
    const prev = pSnap.data();
    const moved = prev.schoolCode !== profile.school.code;
    let oldS = null;
    let newS = null;
    let oldRef = null;
    let newRef = null;
    if (moved) {
      oldRef = doc(db, 'schools', schoolDocId(prev.schoolCode));
      newRef = doc(db, 'schools', schoolDocId(profile.school.code));
      oldS = await tx.get(oldRef);
      newS = await tx.get(newRef);
    }
    tx.update(pRef, { ...playerFields(profile), updatedAt: serverTimestamp() });
    if (moved) {
      if (oldS.exists()) {
        const o = oldS.data();
        tx.set(oldRef, schoolData({ name: o.name, region: o.region }, Math.max(0, o.total - prev.bestScore), Math.max(0, o.count - 1)));
      }
      const n = newS.exists() ? newS.data() : { total: 0, count: 0 };
      tx.set(newRef, schoolData(profile.school, n.total + prev.bestScore, n.count + 1));
    }
  });
}

const Store = {
  MIN_SCHOOL_PLAYERS: 5,
  ready,

  getProfile() {
    return read(KEY_PROFILE, null);
  },

  // asNew: 같은 기기에서 다른 학생이 새로 등록할 때 (기록을 이어받지 않음)
  async saveProfile(profile, { asNew = false } = {}) {
    const current = read(KEY_PROFILE, null);
    const keep = current && !asNew;
    const saved = { ...profile, playerId: keep ? current.playerId : newId() };
    write(KEY_PROFILE, saved);
    if (keep) {
      try {
        await syncProfile(await ready, saved);
      } catch (err) {
        console.error('프로필 온라인 반영 실패', err);
      }
    }
    return saved;
  },

  // 게임 결과 저장. 반환: { online, isBest, best, error? }
  async submitResult(result) {
    let profile = read(KEY_PROFILE, null);
    const history = read(KEY_HISTORY, []);
    history.push({
      playerId: profile.playerId,
      score: result.score,
      maxCombo: result.maxCombo,
      correct: result.correct,
      wrong: result.wrong,
      date: new Date().toISOString(),
    });
    write(KEY_HISTORY, history.slice(-300));

    try {
      const uid = await ready;
      try {
        return { online: true, ...(await pushResult(uid, profile, result)) };
      } catch (err) {
        if (!(err instanceof ForeignPlayerError)) throw err;
        // 이 기기의 로그인 정보가 바뀐 경우: 새 학생 번호로 다시 저장
        profile = { ...profile, playerId: newId() };
        write(KEY_PROFILE, profile);
        return { online: true, ...(await pushResult(uid, profile, result)) };
      }
    } catch (err) {
      console.error('온라인 기록 저장 실패', err);
      const mine = history.filter((h) => h.playerId === profile.playerId);
      return { online: false, error: err, isBest: mine.every((h) => h.score <= result.score), best: Math.max(...mine.map((h) => h.score)) };
    }
  },

  // 이 기기에 남은 나의 도전 기록 (최신순)
  getHistory(playerId) {
    return read(KEY_HISTORY, [])
      .filter((h) => h.playerId === playerId)
      .sort((x, y) => y.date.localeCompare(x.date));
  },

  async getMyPlayer(playerId) {
    await readReady;
    const snap = await getDoc(doc(db, 'players', playerId));
    return snap.exists() ? toPlayer(snap) : null;
  },

  async getNationalTop(n = 10) {
    await readReady;
    const snap = await getDocs(query(collection(db, 'players'), orderBy('bestScore', 'desc'), limit(n)));
    return snap.docs.map(toPlayer);
  },

  // 전국 순위 = 나보다 최고 기록이 높은 학생 수 + 1
  async getNationalRank(bestScore) {
    await readReady;
    const snap = await getCountFromServer(query(collection(db, 'players'), where('bestScore', '>', bestScore)));
    return snap.data().count + 1;
  },

  async getSchoolPlayers(schoolCode) {
    await readReady;
    const snap = await getDocs(query(collection(db, 'players'), where('schoolCode', '==', schoolCode)));
    return snap.docs.map(toPlayer).sort((x, y) => y.score - x.score);
  },

  // 참가 학생이 MIN_SCHOOL_PLAYERS 명 이상인 학교만 평균 점수 순으로
  async getSchoolsTop(n = 10) {
    await readReady;
    const snap = await getDocs(query(collection(db, 'schools'), orderBy('avg', 'desc'), limit(200)));
    return snap.docs
      .map((d) => ({ key: d.id, ...d.data() }))
      .filter((s) => s.count >= Store.MIN_SCHOOL_PLAYERS)
      .slice(0, n);
  },
};

window.Store = Store;
