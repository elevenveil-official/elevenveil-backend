function scoreFromRatio(value, max) {
    if (!value || !max) return 30;
    return Math.min(100, Math.round((value / max) * 100));
  }
  
  function calculatePlayerRadar(stats) {
    if (!stats) {
      return [
        { label: 'Passing', value: 50 },
        { label: 'Shooting', value: 50 },
        { label: 'Dribbling', value: 50 },
        { label: 'Defending', value: 50 },
        { label: 'Physical', value: 50 },
      ];
    }
  
    const passAccuracy = parseInt(stats.passes?.accuracy) || 0;
    const shotsOnTarget = stats.shots?.on || 0;
    const totalShots = stats.shots?.total || 0;
    const dribbleSuccess = stats.dribbles?.success || 0;
    const dribbleAttempts = stats.dribbles?.attempts || 0;
    const duelsWon = stats.duels?.won || 0;
    const duelsTotal = stats.duels?.total || 0;
    const tackles = (stats.tackles?.total || 0) + (stats.tackles?.interceptions || 0);
    const minutesPlayed = stats.games?.minutes || 0;
  
    return [
      { label: 'Passing', value: passAccuracy || scoreFromRatio(stats.passes?.total, 60) },
      { label: 'Shooting', value: totalShots > 0 ? scoreFromRatio(shotsOnTarget, totalShots) : scoreFromRatio(totalShots, 5) },
      { label: 'Dribbling', value: dribbleAttempts > 0 ? scoreFromRatio(dribbleSuccess, dribbleAttempts) : 40 },
      { label: 'Defending', value: scoreFromRatio(tackles, 6) },
      { label: 'Physical', value: duelsTotal > 0 ? scoreFromRatio(duelsWon, duelsTotal) : scoreFromRatio(minutesPlayed, 90) },
    ];
  }
  
  module.exports = { calculatePlayerRadar };