const SCORING_RULES = {
    correctResult: 40,
    correctScoreline: 60,
    xpMultiplier: 10,
  };
  
  function scorePrediction(prediction, actualResult) {
    const actualWinner = actualResult.homeScore > actualResult.awayScore ? 'home'
      : actualResult.homeScore < actualResult.awayScore ? 'away' : 'draw';
  
    const predictedWinner = prediction.predictedHomeScore > prediction.predictedAwayScore ? 'home'
      : prediction.predictedHomeScore < prediction.predictedAwayScore ? 'away' : 'draw';
  
    const correctResult = predictedWinner === actualWinner;
    const correctScoreline = prediction.predictedHomeScore === actualResult.homeScore
      && prediction.predictedAwayScore === actualResult.awayScore;
  
    let visionScore = 0;
    if (correctResult) visionScore += SCORING_RULES.correctResult;
    if (correctScoreline) visionScore += SCORING_RULES.correctScoreline;
  
    return {
      visionScore: Math.min(100, visionScore),
      correctResult,
      correctScoreline,
      xpEarned: visionScore * SCORING_RULES.xpMultiplier,
    };
  }
  
  module.exports = { scorePrediction, SCORING_RULES };