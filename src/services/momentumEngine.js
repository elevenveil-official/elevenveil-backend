const WEIGHTS = {
    'Shots on Goal': 0.35,
    'Total Shots': 0.20,
    'Corner Kicks': 0.15,
    'Ball Possession': 0.15,
    'Passes %': 0.15,
  };
  
  function parseValue(raw) {
    if (raw === null || raw === undefined) return 0;
    const num = parseFloat(String(raw).replace('%', ''));
    return isNaN(num) ? 0 : num;
  }
  
  function getStat(teamStats, type) {
    const found = teamStats?.statistics?.find(s => s?.type === type);
    return parseValue(found?.value);
  }
  
  function calculateMomentum(statsArray) {
    if (!Array.isArray(statsArray) || statsArray.length < 2) {
      return { home: 50, away: 50 };
    }
  
    const [homeStats, awayStats] = statsArray;
    let homeScore = 0;
    let totalWeight = 0;
  
    Object.entries(WEIGHTS).forEach(([type, weight]) => {
      const homeVal = getStat(homeStats, type);
      const awayVal = getStat(awayStats, type);
      const total = homeVal + awayVal;
  
      if (total > 0) {
        const homeShare = (homeVal / total) * 100;
        homeScore += homeShare * weight;
        totalWeight += weight;
      }
    });
  
    if (totalWeight === 0) return { home: 50, away: 50 };
  
    const homeFinal = Math.round(homeScore / totalWeight * 100) / 100;
    const home = Math.round(homeFinal);
    const away = 100 - home;
  
    return { home, away };
  }
  
  module.exports = { calculateMomentum };
  