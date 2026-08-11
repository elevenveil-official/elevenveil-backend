const express = require('express');
const { apiSportsFetch } = require('../services/apiSportsClient');
const { calculateMomentum } = require('../services/momentumEngine');
const { generateMatchStory } = require('../services/storyEngine');
const router = express.Router();
const ALLOWED_LEAGUES = [39, 140, 135, 78, 61, 2, 3]; // Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League, Europa League


router.get('/live', async (req, res) => {
  const data = await apiSportsFetch('/fixtures?live=all');
  const filtered = (data?.response || []).filter(m => ALLOWED_LEAGUES.includes(m?.league?.id));
  res.json({ ...data, response: filtered, results: filtered.length });
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

module.exports = router;
