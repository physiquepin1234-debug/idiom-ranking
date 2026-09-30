// 관용표현 문제 뽑기와 분류
const Idioms = (() => {
  const all = window.IDIOMS || [];

  // 앞말+뒷말 조합이 사전에 있는 표현인지 (예: "입이"+"무겁다", "마음이"+"무겁다" 모두 정답)
  const validPairs = new Set(all.map((it) => it.a + '|' + it.b));
  function isValidPair(a, b) {
    return validPairs.has(a + '|' + b);
  }

  function shuffle(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // 한 라운드에 낼 표현 n개를 무작위로 고릅니다.
  // 한 라운드 안에서 정답이 두 개 이상 생기지 않도록
  // (앞말이나 뒷말이 겹치거나, 다른 표현끼리 이어도 말이 되는 경우) 함께 내지 않습니다.
  // exclude: 이번 게임에서 이미 나온 표현 id (새 라운드에 다시 나오지 않도록)
  function pickRound(n = 10, exclude = new Set()) {
    const picked = [];
    for (const cand of shuffle(all.filter((it) => !exclude.has(it.id)))) {
      const clash = picked.some(
        (p) =>
          p.a === cand.a ||
          p.b === cand.b ||
          isValidPair(p.a, cand.b) ||
          isValidPair(cand.a, p.b)
      );
      if (!clash) picked.push(cand);
      if (picked.length === n) break;
    }
    return picked;
  }

  // 연습모드 분류용: 앞말이 어느 신체 부위로 시작하는지
  const CATEGORIES = ['발', '손', '눈', '귀', '입', '마음', '머리', '어깨', '코', '허리', '배', '가슴', '간', '목', '기'];
  function categoryOf(item) {
    if (item.a.startsWith('배짱')) return '기타';
    const found = CATEGORIES.find((c) => item.a.startsWith(c));
    return found || '기타';
  }

  function findPair(a, b) {
    return all.find((it) => it.a === a && it.b === b);
  }

  return { all, shuffle, pickRound, isValidPair, findPair, categoryOf, CATEGORIES: [...CATEGORIES, '기타'] };
})();
