const express = require('express');
const supabase = require('../services/supabaseClient');
const { apiSportsFetch } = require('../services/apiSportsClient');
const { sendPushNotification } = require('../services/pushSender');
const { isTeamInMatch } = require('../services/teamMatching');
const { getCached } = require('../services/simpleCache');
const TEAMS = require('../data/teams');
const router = express.Router();

function buildEventText(event, teamName) {
  const player = event?.player?.name || 'A player';
  if (event?.type === 'Goal') return `${player} scores for ${teamName}!`;
  if (event?.type === 'Card' && event?.detail === 'Red Card') return `${player} is sent off — ${teamName} down to ten.`;
  return null;
}

router.get('/check-followed-matches', async (req, res) => {
  const liveData = getCached('live', 20000);
  const liveMatches = liveData?.response || [];
  if (liveMatches.length === 0) return res.json({ checked: 0, notified: 0 });

  const { data: profiles } = await supabase.from('profiles').select('id, push_token').not('push_token', 'is', null);
  const { data: followed } = await supabase.from('followed_teams').select('user_id, team_id');

  let notifiedCount = 0;

  for (const match of liveMatches) {
    const fixtureId = match.fixture.id;
    const homeName = match.teams?.home?.name;
    const awayName = match.teams?.away?.name;

    const relevantTeamIds = TEAMS.filter(t => isTeamInMatch(t.matchKeyword, homeName, awayName)).map(t => t.id);
    if (relevantTeamIds.length === 0) continue;

    const followerIds = (followed || []).filter(f => relevantTeamIds.includes(f.team_id)).map(f => f.user_id);
    if (followerIds.length === 0) continue;

    const tokens = (profiles || []).filter(p => followerIds.includes(p.id)).map(p => p.push_token).filter(Boolean);
    if (tokens.length === 0) continue;

    const eventsData = await apiSportsFetch(`/fixtures/events?fixture=${fixtureId}`);
    const events = eventsData?.response || [];

    for (const event of events) {
      const eventKey = `${event?.time?.elapsed}-${event?.type}-${event?.player?.id}`;
      const text = buildEventText(event, event?.team?.name);
      if (!text) continue;

      const { error: insertError } = await supabase.from('notified_events').insert({ fixture_id: fixtureId, event_key: eventKey });
      if (insertError) continue;

      for (const token of tokens) {
        await sendPushNotification(token, 'Behind the Veil', text);
      }
      notifiedCount += tokens.length;
    }
  }

  res.json({ checked: liveMatches.length, notified: notifiedCount });
});

module.exports = router;