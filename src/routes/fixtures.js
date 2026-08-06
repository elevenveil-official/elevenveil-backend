const express = require('express');
const { apiSportsFetch } = require('../services/apiSportsClient');
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

router.get('/:id/lineups', async (req, res) => {
  const data = await apiSportsFetch(`/fixtures/lineups?fixture=${req.params.id}`);
  res.json(data);
});

module.exports = router;
