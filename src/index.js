require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fixturesRoutes = require('./routes/fixtures');

const app = express();
app.use(cors());
app.use('/fixtures', fixturesRoutes);

const predictionsRoutes = require('./routes/predictions');
app.use('/predictions', predictionsRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend corriendo en puerto ${PORT}`));
