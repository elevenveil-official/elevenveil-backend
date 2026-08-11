const express = require('express');
const { apiSportsFetch } = require('../services/apiSportsClient');
const { calculateMomentum } = require('../services/momentumEngine');
const { generateMatchStory } = require('../services/storyEngine');
const router = express.Router();


router.get('/live', async (req, res) => {
  const data = await apiSportsFetch('/fixtures?live=all');
  res.json(data);
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
  const data = await apiSportsFetch(`/fixtures?league=${req.params.leagueId}&last=5`);
  res.json(data);
});

module.exports = router;
