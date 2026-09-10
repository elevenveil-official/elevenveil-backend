const SCORING_RULES = {
  correctResult: 40,
  correctScoreline: 60,
  correctScorer: 30,
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
  const correctScorer = !!prediction.predictedScorerId
    && (actualResult.scorers || []).includes(prediction.predictedScorerId);

  let rawScore = 0;
  if (correctResult) rawScore += SCORING_RULES.correctResult;
  if (correctScoreline) rawScore += SCORING_RULES.correctScoreline;
  if (correctScorer) rawScore += SCORING_RULES.correctScorer;

  const visionScore = Math.min(100, rawScore);

  return {
    visionScore,
    correctResult,
    correctScoreline,
    correctScorer,
    xpEarned: visionScore * SCORING_RULES.xpMultiplier,
  };
}

module.exports = { scorePrediction, SCORING_RULES };