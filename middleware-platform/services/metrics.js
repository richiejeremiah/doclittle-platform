// Simple in-memory metrics (can be replaced by Prometheus later)
const counters = Object.create(null);

function increment(name, value = 1) {
  counters[name] = (counters[name] || 0) + value;
}

function getAll() {
  return { ...counters };
}

module.exports = { increment, getAll };


