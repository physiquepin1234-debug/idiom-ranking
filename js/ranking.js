// 학생 목록(각자 최고 기록)으로 순위를 계산합니다.
const Ranking = (() => {
  // 반별 평균 점수 순위. 평균은 각 학생의 최고 기록으로 계산합니다.
  function classesInSchool(players) {
    const groups = new Map();
    for (const p of players) {
      const key = p.grade + '-' + p.cls;
      if (!groups.has(key)) groups.set(key, { key, label: `${p.grade}학년 ${p.cls}반`, total: 0, count: 0 });
      const g = groups.get(key);
      g.total += p.score;
      g.count += 1;
    }
    return [...groups.values()]
      .map((g) => ({ ...g, avg: Math.round(g.total / g.count) }))
      .sort((x, y) => y.avg - x.avg || y.count - x.count);
  }

  // 점수 높은 순 목록에서 내 순위 (같은 점수는 같은 순위, 없으면 null)
  function rankOf(players, playerId) {
    const me = players.find((p) => p.playerId === playerId);
    return me ? players.filter((p) => p.score > me.score).length + 1 : null;
  }

  return { classesInSchool, rankOf };
})();
