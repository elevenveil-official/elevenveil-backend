const BASE_URL = 'https://v3.football.api-sports.io';

async function apiSportsFetch(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'x-apisports-key': process.env.API_SPORTS_KEY,
      'x-apisports-host': 'v3.football.api-sports.io'
    }
  });
  return res.json();
}

module.exports = { apiSportsFetch };
