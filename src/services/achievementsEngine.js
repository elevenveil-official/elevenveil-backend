const ACHIEVEMENTS = [
    {
      id: 'first_prediction',
      name: 'First Prediction',
      description: 'Submit your first Match Vision.',
      rarity: 'Common',
      icon: 'target',
      check: (ctx) => ctx.totalPredictions >= 1,
    },
    {
      id: 'five_predictions',
      name: 'Five in a Row',
      description: 'Submit 5 Match Visions.',
      rarity: 'Common',
      icon: 'numeric-5-circle',
      check: (ctx) => ctx.totalPredictions >= 5,
    },
    {
      id: 'first_win',
      name: 'On the Board',
      description: 'Score points on a Match Vision for the first time.',
      rarity: 'Common',
      icon: 'chart-line',
      check: (ctx) => ctx.scoredPredictions.some(p => p.vision_score > 0),
    },
    {
      id: 'perfect_call',
      name: 'Perfect Call',
      description: 'Predict the exact final score of a match.',
      rarity: 'Rare',
      icon: 'crosshairs',
      check: (ctx) => ctx.scoredPredictions.some(p => p.vision_score === 100),
    },
    {
      id: 'club_chosen',
      name: 'Colours Declared',
      description: 'Follow your first club.',
      rarity: 'Common',
      icon: 'shield-star',
      check: (ctx) => ctx.followedTeamsCount >= 1,
    },
    {
      id: 'scout_rank',
      name: 'Scout',
      description: 'Reach the Scout rank.',
      rarity: 'Common',
      icon: 'medal',
      check: (ctx) => ctx.xp >= 500,
    },
  ];
  
  function evaluateAchievements(ctx) {
    return ACHIEVEMENTS.map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      rarity: a.rarity,
      icon: a.icon,
      unlocked: a.check(ctx),
    }));
  }
  
  module.exports = { ACHIEVEMENTS, evaluateAchievements };