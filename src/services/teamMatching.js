function normalize(str) {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }
  
  function isTeamInMatch(matchKeyword, homeName, awayName) {
    const keyword = normalize(matchKeyword);
    return normalize(homeName).includes(keyword) || normalize(awayName).includes(keyword);
  }
  
  module.exports = { normalize, isTeamInMatch };