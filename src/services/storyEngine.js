function generateMatchStory(events) {
    if (!Array.isArray(events) || events.length === 0) {
      return { headline: 'A quiet affair', body: 'No major incidents have been recorded in this match yet.' };
    }
  
    const goals = events.filter(e => e?.type === 'Goal');
    const cards = events.filter(e => e?.type === 'Card' && e?.detail === 'Red Card');
  
    const scoreCount = {};
    goals.forEach(g => {
      const team = g?.team?.name || 'Unknown';
      scoreCount[team] = (scoreCount[team] || 0) + 1;
    });
  
    const teams = Object.keys(scoreCount);
    let headline = 'A tightly contested battle';
    if (teams.length === 2) {
      const [a, b] = teams;
      if (scoreCount[a] > scoreCount[b]) headline = `${a} take control`;
      else if (scoreCount[b] > scoreCount[a]) headline = `${b} take control`;
      else headline = `${a} and ${b} share the spoils`;
    } else if (teams.length === 1) {
      headline = `${teams[0]} dominate the scoresheet`;
    }
  
    const momentSentences = goals.map(g => {
      const minute = g?.time?.elapsed || '?';
      const scorer = g?.player?.name || 'a player';
      const team = g?.team?.name || 'their side';
      return `In the ${minute}' minute, ${scorer} found the net for ${team}.`;
    });
  
    cards.forEach(c => {
      const minute = c?.time?.elapsed || '?';
      const player = c?.player?.name || 'a player';
      const team = c?.team?.name || 'their side';
      momentSentences.push(`${player} (${team}) was sent off in the ${minute}' minute, changing the shape of the match.`);
    });
  
    const body = momentSentences.length > 0
      ? momentSentences.join(' ')
      : 'The match has stayed goalless and cautious so far, with both sides yet to find a breakthrough.';
  
    return { headline, body };
  }
  
  module.exports = { generateMatchStory };