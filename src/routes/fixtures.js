const express = require('express');
const { apiSportsFetch } = require('../services/apiSportsClient');
const { calculateMomentum } = require('../services/momentumEngine');
const { generateMatchStory } = require('../services/storyEngine');
const { getCached, setCache } = require('../services/simpleCache');
const { calculatePlayerRadar } = require('../services/radarEngine');

const router = express.Router();

const ALLOWED_LEAGUES = [39, 140, 135, 78, 61, 2, 3]; // Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League, Europa League

router.get('/live', async (req, res) => {
  const cached = getCached('live', 20000);
  if (cached) return res.json(cached);

  const data = await apiSportsFetch('/fixtures?live=all');
  const filtered = (data?.response || []).filter(m => ALLOWED_LEAGUES.includes(m?.league?.id));
  const result = { ...data, response: filtered, results: filtered.length };
  setCache('live', result);
  res.json(result);
});

// RUTA INTEGRADA: /upcoming (con caché de 10 minutos)
router.get('/upcoming', async (req, res) => {
  const cached = getCached('upcoming', 10 * 60 * 1000);
  if (cached) return res.json(cached);

  const days = [0, 1, 2, 3, 4, 5, 6].map(offset => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().split('T')[0];
  });

  const allFixtures = [];
  for (const day of days) {
    const data = await apiSportsFetch(`/fixtures?date=${day}`);
    const matches = (data?.response || []).filter(
      m => ALLOWED_LEAGUES.includes(m?.league?.id) && m?.fixture?.status?.short === 'NS'
    );
    allFixtures.push(...matches);
  }

  const sorted = allFixtures.sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date));
  const result = { response: sorted };
  setCache('upcoming', result);
  res.json(result);
});

router.get('/:id/events', async (req, res) => {
  const data = await apiSportsFetch(`/fixtures/events?fixture=${req.params.id}`);
  res.json(data);
});

router.get('/:id/statistics', async (req, res) => {
  const data = await apiSportsFetch(`/fixtures/statistics?fixture=${req.params.id}`);
  res.json(data);
});

router.get('/:id/momentum', async (req, res) => {
  const data = await apiSportsFetch(`/fixtures/statistics?fixture=${req.params.id}`);
  const momentum = calculateMomentum(data?.response);
  res.json({ momentum });
});

router.get('/:id/lineups', async (req, res) => {
  const data = await apiSportsFetch(`/fixtures/lineups?fixture=${req.params.id}`);
  res.json(data);
});

router.get('/:id/story', async (req, res) => {
  const data = await apiSportsFetch(`/fixtures/events?fixture=${req.params.id}`);
  const story = generateMatchStory(data?.response);
  res.json({ story });
});

router.get('/recent/:leagueId', async (req, res) => {
  let recent = [];
  let lastErrors = null;

  for (const season of [2024, 2023, 2022]) {
    const data = await apiSportsFetch(`/fixtures?league=${req.params.leagueId}&season=${season}&status=FT`);
    lastErrors = data?.errors;
    const matches = data?.response || [];
    if (matches.length > 0) {
      recent = matches
        .sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date))
        .slice(0, 5);
      break;
    }
  }

  res.json({ response: recent, debugErrors: lastErrors });
});

router.get('/:fixtureId/player/:playerId/radar', async (req, res) => {
  const data = await apiSportsFetch(`/fixtures/players?fixture=${req.params.fixtureId}`);
  let playerStats = null;

  for (const team of data?.response || []) {
    const found = team.players?.find(p => String(p.player.id) === String(req.params.playerId));
    if (found) {
      playerStats = found.statistics?.[0];
      break;
    }
  }

  const radar = calculatePlayerRadar(playerStats);
  const rating = playerStats?.games?.rating || null;
  res.json({ radar, rating });
});

module.exports = router;
