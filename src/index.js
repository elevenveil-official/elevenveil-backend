require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fixturesRoutes = require('./routes/fixtures');

const app = express();
app.use(cors());
app.use('/fixtures', fixturesRoutes);

const predictionsRoutes = require('./routes/predictions');
app.use('/predictions', predictionsRoutes);

const vaultRoutes = require('./routes/vault');
app.use('/vault', vaultRoutes);

// Aquí está la nueva ruta del leaderboard que te pedían añadir
app.use('/leaderboard', require('./routes/leaderboard'));
app.use('/followed-teams', require('./routes/followedTeams'));
app.use('/notifications', require('./routes/notifications'));
app.use('/achievements', require('./routes/achievements'));
app.use('/rewards', require('./routes/rewards'));
app.use('/username', require('./routes/username'));
app.use('/leagues', require('./routes/leagues'));

const livePredictionsRoutes = require('./routes/livePredictions');
app.use('/live-predictions', livePredictionsRoutes);
app.use('/coin-wagers', require('./routes/coinWagers'));
app.use('/account', require('./routes/account'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend corriendo en puerto ${PORT}`));
