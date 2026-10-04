const { round } = require('./round.cjs');

function total(values) {
  return round(values.reduce((a, b) => a + b, 0));
}

module.exports = total;
