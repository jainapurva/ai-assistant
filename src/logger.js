// Rolling window of error timestamps — read by health-reporter.js for the
// admin dashboard's errors-last-hour metric.
let errorTimestamps = [];

function recordError() {
  const now = Date.now();
  errorTimestamps.push(now);
  const cutoff = now - 3600000;
  if (errorTimestamps.length > 1000 || errorTimestamps[0] < cutoff) {
    errorTimestamps = errorTimestamps.filter((t) => t >= cutoff);
  }
}

function getErrorsLastHour() {
  const cutoff = Date.now() - 3600000;
  return errorTimestamps.filter((t) => t >= cutoff).length;
}

function log(level, ...args) {
  const ts = new Date().toISOString();
  console[level === 'error' ? 'error' : 'log'](`[${ts}] [${level}]`, ...args);
}

module.exports = {
  info: (...args) => log('INFO', ...args),
  error: (...args) => { recordError(); log('ERROR', ...args); },
  warn: (...args) => log('WARN', ...args),
  getErrorsLastHour,
};
