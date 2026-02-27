function log(level, ...args) {
  const ts = new Date().toISOString();
  console[level === 'error' ? 'error' : 'log'](`[${ts}] [${level}]`, ...args);
}

module.exports = {
  info: (...args) => log('INFO', ...args),
  error: (...args) => log('ERROR', ...args),
  warn: (...args) => log('WARN', ...args),
};
