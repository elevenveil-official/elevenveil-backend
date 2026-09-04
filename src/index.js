require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fixturesRoutes = require('./routes/fixtures');

const app = express();
app.use(cors());
app.use('/fixtures', fixturesRoutes);

const predictionsRoutes = require('./routes/predictions');
app.use('/predictions', predictionsRoutes);

// Aquí está la nueva ruta del leaderboard que te pedían añadir
app.use('/leaderboard', require('./routes/leaderboard'));
app.use('/followed-teams', require('./routes/followedTeams'));
app.use('/notifications', require('./routes/notifications'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend corriendo en puerto ${PORT}`));
