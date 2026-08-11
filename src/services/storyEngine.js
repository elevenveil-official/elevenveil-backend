function buildMomentText(event) {
  const player = event?.player?.name || 'A player';
  const team = event?.team?.name || 'their side';

  if (event?.type === 'Goal') {
    return `${player} finds the net for ${team}.`;
  }
  if (event?.type === 'Card' && event?.detail === 'Red Card') {
    return `${player} is sent off — ${team} down to ten men.`;
  }
  return `${player} (${team}) — key moment.`;
}

function generateMatchStory(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      headline: 'A quiet affair',
      moments: [],
      closing: 'No major incidents have been recorded in this match yet.',
    };
  }

  const goals = events.filter(e => e?.type === 'Goal');
  const redCards = events.filter(e => e?.type === 'Card' && e?.detail === 'Red Card');

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

  const keyEvents = [...goals, ...redCards].sort(
    (a, b) => (a?.time?.elapsed ?? 0) - (b?.time?.elapsed ?? 0)
  );

  const moments = keyEvents.map(ev => ({
    minute: ev?.time?.elapsed ?? null,
    type: ev?.type === 'Goal' ? 'goal' : 'red_card',
    team: { id: ev?.team?.id ?? null, name: ev?.team?.name || 'Team' },
    player: { id: ev?.player?.id ?? null, name: ev?.player?.name || 'Player' },
    text: buildMomentText(ev),
  }));

  const closing = moments.length > 0
    ? "That's how it stands right now — every twist, tracked live."
    : 'The match has stayed goalless and cautious so far, with both sides yet to find a breakthrough.';

  return { headline, moments, closing };
}

module.exports = { generateMatchStory };