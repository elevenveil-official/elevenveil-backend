const RANKS = [
    { name: 'Rookie', minXp: 0 },
    { name: 'Scout', minXp: 500 },
    { name: 'Analyst', minXp: 1500 },
    { name: 'Tactician', minXp: 3500 },
    { name: 'Strategist', minXp: 7000 },
    { name: 'Oracle', minXp: 13000 },
    { name: 'Legend', minXp: 22000 },
    { name: 'The Veil', minXp: 35000 },
  ];
  
  function getRankForXp(xp) {
    let current = RANKS[0];
    for (const rank of RANKS) {
      if (xp >= rank.minXp) current = rank;
      else break;
    }
    return current.name;
  }
  
  function getRankProgress(xp) {
    const currentIndex = RANKS.findIndex(r => r.name === getRankForXp(xp));
    const current = RANKS[currentIndex];
    const next = RANKS[currentIndex + 1] || null;
    return {
      rank: current.name,
      xp,
      nextRank: next ? next.name : null,
      xpToNext: next ? next.minXp - xp : 0,
    };
  }
  
  module.exports = { RANKS, getRankForXp, getRankProgress };