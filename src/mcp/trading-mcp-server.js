#!/usr/bin/env node

/**
 * Paper Trading MCP Server — simulated trading with real market data.
 *
 * Reads PORTFOLIO_PATH from env var, manages portfolio state in a JSON file,
 * and fetches live prices from Yahoo Finance (no API key needed).
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const fs = require('fs');
const path = require('path');

const PORTFOLIO_PATH = process.env.PORTFOLIO_PATH;
if (!PORTFOLIO_PATH) {
  process.stderr.write('ERROR: PORTFOLIO_PATH env var is required\n');
  process.exit(1);
}

const STARTING_CASH = 100_000;
const QUOTE_CACHE_TTL = 30_000; // 30 seconds
const quoteCache = new Map();

// ── Portfolio persistence ────────────────────────────────────────────────────

function defaultPortfolio() {
  return {
    cash: STARTING_CASH,
    positions: [],
    trades: [],
    createdAt: new Date().toISOString(),
  };
}

function loadPortfolio() {
  try {
    if (fs.existsSync(PORTFOLIO_PATH)) {
      return JSON.parse(fs.readFileSync(PORTFOLIO_PATH, 'utf8'));
    }
  } catch (err) {
    process.stderr.write(`WARN: Failed to load portfolio: ${err.message}\n`);
  }
  const p = defaultPortfolio();
  savePortfolio(p);
  return p;
}

function savePortfolio(portfolio) {
  const dir = path.dirname(PORTFOLIO_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = PORTFOLIO_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(portfolio, null, 2));
  fs.renameSync(tmp, PORTFOLIO_PATH);
}

// ── Yahoo Finance helpers ────────────────────────────────────────────────────

async function fetchQuote(symbol) {
  const upper = symbol.toUpperCase();
  const cached = quoteCache.get(upper);
  if (cached && Date.now() - cached.ts < QUOTE_CACHE_TTL) {
    return cached.data;
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(upper)}?interval=1d&range=1d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PaperTrader/1.0)' },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Yahoo Finance returned ${res.status} for ${upper}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error(`No data found for symbol: ${upper}`);

  const price = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose || meta.previousClose || price;
  const change = price - prevClose;
  const changePercent = prevClose ? ((change / prevClose) * 100) : 0;

  const quote = {
    symbol: upper,
    name: meta.shortName || meta.longName || upper,
    price,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 100) / 100,
    currency: meta.currency || 'USD',
    exchange: meta.exchangeName || 'N/A',
    marketState: meta.marketState || 'UNKNOWN',
  };

  quoteCache.set(upper, { data: quote, ts: Date.now() });
  return quote;
}

async function searchSymbol(query) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PaperTrader/1.0)' },
  });

  if (!res.ok) throw new Error(`Search failed: HTTP ${res.status}`);

  const data = await res.json();
  return (data.quotes || []).map(q => ({
    symbol: q.symbol,
    name: q.shortname || q.longname || q.symbol,
    type: q.quoteType || 'UNKNOWN',
    exchange: q.exchDisp || q.exchange || 'N/A',
  }));
}

async function fetchOptionsChain(symbol, expiry) {
  let url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol.toUpperCase())}`;
  if (expiry) url += `?date=${expiry}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PaperTrader/1.0)' },
  });

  if (!res.ok) throw new Error(`Options chain failed: HTTP ${res.status}`);

  const data = await res.json();
  const result = data?.optionChain?.result?.[0];
  if (!result) throw new Error(`No options data for ${symbol}`);

  const expirations = (result.expirationDates || []).map(ts => new Date(ts * 1000).toISOString().split('T')[0]);
  const calls = (result.options?.[0]?.calls || []).map(formatOption);
  const puts = (result.options?.[0]?.puts || []).map(formatOption);

  return {
    underlying: symbol.toUpperCase(),
    underlyingPrice: result.quote?.regularMarketPrice || null,
    expirations,
    calls: calls.slice(0, 20),
    puts: puts.slice(0, 20),
  };
}

function formatOption(opt) {
  return {
    contractSymbol: opt.contractSymbol,
    strike: opt.strike,
    expiry: opt.expiration ? new Date(opt.expiration * 1000).toISOString().split('T')[0] : null,
    type: opt.contractSymbol?.includes('C') ? 'call' : 'put',
    lastPrice: opt.lastPrice,
    bid: opt.bid,
    ask: opt.ask,
    volume: opt.volume || 0,
    openInterest: opt.openInterest || 0,
    impliedVolatility: opt.impliedVolatility ? Math.round(opt.impliedVolatility * 10000) / 100 : null,
  };
}

// ── Trading logic ────────────────────────────────────────────────────────────

async function executeBuy(portfolio, symbol, quantity, type) {
  const upper = symbol.toUpperCase();
  const quote = await fetchQuote(upper);
  const price = quote.price;

  // Options: price is per-share premium, 1 contract = 100 shares
  const multiplier = type === 'option' ? 100 : 1;
  const total = price * quantity * multiplier;

  if (total > portfolio.cash) {
    const maxQty = Math.floor(portfolio.cash / (price * multiplier));
    throw new Error(
      `Insufficient funds. Need $${total.toFixed(2)} but only have $${portfolio.cash.toFixed(2)} cash. ` +
      `You can afford ${maxQty} ${type === 'option' ? 'contract(s)' : 'share(s)'}.`
    );
  }

  // Check for existing position to average in
  const existing = portfolio.positions.find(p => p.symbol === upper && p.type === type);
  if (existing) {
    const totalCost = (existing.avgCostBasis * existing.quantity * multiplier) + total;
    const totalQty = existing.quantity + quantity;
    existing.avgCostBasis = totalCost / (totalQty * multiplier);
    existing.quantity = totalQty;
  } else {
    const position = { symbol: upper, type, quantity, avgCostBasis: price, openedAt: new Date().toISOString() };
    portfolio.positions.push(position);
  }

  portfolio.cash -= total;

  const trade = {
    id: `t_${Date.now()}`,
    symbol: upper,
    type,
    action: 'buy',
    quantity,
    price,
    total,
    timestamp: new Date().toISOString(),
  };
  portfolio.trades.push(trade);
  savePortfolio(portfolio);

  return {
    action: 'BUY',
    symbol: upper,
    name: quote.name,
    quantity,
    price,
    total,
    cashRemaining: portfolio.cash,
    type,
  };
}

async function executeSell(portfolio, symbol, quantity, type) {
  const upper = symbol.toUpperCase();
  const posIndex = portfolio.positions.findIndex(p => p.symbol === upper && p.type === type);
  if (posIndex === -1) throw new Error(`No ${type} position found for ${upper}`);

  const position = portfolio.positions[posIndex];
  if (quantity > position.quantity) {
    throw new Error(`Cannot sell ${quantity} — you only hold ${position.quantity} ${type === 'option' ? 'contract(s)' : 'share(s)'} of ${upper}`);
  }

  const quote = await fetchQuote(upper);
  const price = quote.price;
  const multiplier = type === 'option' ? 100 : 1;
  const total = price * quantity * multiplier;

  portfolio.cash += total;

  if (quantity === position.quantity) {
    portfolio.positions.splice(posIndex, 1);
  } else {
    position.quantity -= quantity;
  }

  const trade = {
    id: `t_${Date.now()}`,
    symbol: upper,
    type,
    action: 'sell',
    quantity,
    price,
    total,
    costBasis: position.avgCostBasis,
    realizedPnL: (price - position.avgCostBasis) * quantity * multiplier,
    timestamp: new Date().toISOString(),
  };
  portfolio.trades.push(trade);
  savePortfolio(portfolio);

  return {
    action: 'SELL',
    symbol: upper,
    name: quote.name,
    quantity,
    price,
    total,
    realizedPnL: trade.realizedPnL,
    cashRemaining: portfolio.cash,
    type,
  };
}

async function getPortfolioView(portfolio) {
  const positions = [];
  let totalValue = portfolio.cash;
  let totalCost = 0;

  for (const pos of portfolio.positions) {
    try {
      const quote = await fetchQuote(pos.symbol);
      const multiplier = pos.type === 'option' ? 100 : 1;
      const currentValue = quote.price * pos.quantity * multiplier;
      const costBasis = pos.avgCostBasis * pos.quantity * multiplier;
      const unrealizedPnL = currentValue - costBasis;
      const unrealizedPnLPercent = costBasis > 0 ? ((unrealizedPnL / costBasis) * 100) : 0;

      positions.push({
        symbol: pos.symbol,
        type: pos.type,
        quantity: pos.quantity,
        avgCostBasis: pos.avgCostBasis,
        currentPrice: quote.price,
        currentValue,
        unrealizedPnL: Math.round(unrealizedPnL * 100) / 100,
        unrealizedPnLPercent: Math.round(unrealizedPnLPercent * 100) / 100,
        dayChange: quote.change,
        dayChangePercent: quote.changePercent,
      });

      totalValue += currentValue;
      totalCost += costBasis;
    } catch (err) {
      positions.push({
        symbol: pos.symbol,
        type: pos.type,
        quantity: pos.quantity,
        avgCostBasis: pos.avgCostBasis,
        error: `Failed to fetch price: ${err.message}`,
      });
    }
  }

  const totalPnL = totalValue - STARTING_CASH;
  const totalPnLPercent = ((totalPnL / STARTING_CASH) * 100);

  return {
    cash: Math.round(portfolio.cash * 100) / 100,
    positions,
    totalValue: Math.round(totalValue * 100) / 100,
    totalPnL: Math.round(totalPnL * 100) / 100,
    totalPnLPercent: Math.round(totalPnLPercent * 100) / 100,
    startingBalance: STARTING_CASH,
    positionCount: portfolio.positions.length,
    tradeCount: portfolio.trades.length,
    createdAt: portfolio.createdAt,
  };
}

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'paper-trading',
  version: '1.0.0',
});

function mcpResult(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function mcpError(msg) {
  return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
}

// ── Market Data Tools ────────────────────────────────────────────────────────

server.tool(
  'market_quote',
  'Get real-time price quote for a stock, crypto, or option symbol',
  { symbol: z.string().describe('Ticker symbol (e.g. AAPL, BTC-USD, TSLA)') },
  async ({ symbol }) => {
    try {
      const quote = await fetchQuote(symbol);
      return mcpResult(quote);
    } catch (err) {
      return mcpError(err.message);
    }
  },
);

server.tool(
  'market_search',
  'Search for a ticker symbol by company name or keyword',
  { query: z.string().describe('Search query (e.g. "apple", "bitcoin", "tesla")') },
  async ({ query }) => {
    try {
      const results = await searchSymbol(query);
      return mcpResult({ results, count: results.length });
    } catch (err) {
      return mcpError(err.message);
    }
  },
);

server.tool(
  'options_chain',
  'Get options chain for a stock (available calls and puts)',
  {
    symbol: z.string().describe('Underlying stock symbol (e.g. AAPL, TSLA)'),
    expiry: z.string().optional().describe('Expiration date as Unix timestamp (optional — omit to get nearest expiry)'),
  },
  async ({ symbol, expiry }) => {
    try {
      const chain = await fetchOptionsChain(symbol, expiry);
      return mcpResult(chain);
    } catch (err) {
      return mcpError(err.message);
    }
  },
);

// ── Trading Tools ────────────────────────────────────────────────────────────

server.tool(
  'trade_buy',
  'Buy shares of a stock, crypto, or an options contract',
  {
    symbol: z.string().describe('Ticker symbol (e.g. AAPL, BTC-USD, AAPL250418C00200000)'),
    quantity: z.number().positive().describe('Number of shares or contracts to buy'),
    type: z.enum(['stock', 'crypto', 'option']).default('stock').describe('Asset type'),
  },
  async ({ symbol, quantity, type }) => {
    try {
      const portfolio = loadPortfolio();
      const result = await executeBuy(portfolio, symbol, quantity, type);
      return mcpResult(result);
    } catch (err) {
      return mcpError(err.message);
    }
  },
);

server.tool(
  'trade_sell',
  'Sell shares of a stock, crypto, or an options contract',
  {
    symbol: z.string().describe('Ticker symbol (e.g. AAPL, BTC-USD)'),
    quantity: z.number().positive().describe('Number of shares or contracts to sell'),
    type: z.enum(['stock', 'crypto', 'option']).default('stock').describe('Asset type'),
  },
  async ({ symbol, quantity, type }) => {
    try {
      const portfolio = loadPortfolio();
      const result = await executeSell(portfolio, symbol, quantity, type);
      return mcpResult(result);
    } catch (err) {
      return mcpError(err.message);
    }
  },
);

// ── Portfolio Tools ──────────────────────────────────────────────────────────

server.tool(
  'portfolio_view',
  'View full portfolio summary with live prices and P&L',
  {},
  async () => {
    try {
      const portfolio = loadPortfolio();
      const view = await getPortfolioView(portfolio);
      return mcpResult(view);
    } catch (err) {
      return mcpError(err.message);
    }
  },
);

server.tool(
  'trade_history',
  'View past trade history',
  { limit: z.number().optional().default(20).describe('Max number of trades to return (default 20)') },
  async ({ limit }) => {
    try {
      const portfolio = loadPortfolio();
      const trades = portfolio.trades.slice(-limit).reverse();
      return mcpResult({ trades, total: portfolio.trades.length, showing: trades.length });
    } catch (err) {
      return mcpError(err.message);
    }
  },
);

server.tool(
  'portfolio_reset',
  'Reset portfolio to starting balance of $100,000 (deletes all positions and history)',
  { confirm: z.literal('RESET').describe('Type RESET to confirm') },
  async ({ confirm }) => {
    if (confirm !== 'RESET') return mcpError('Type RESET to confirm portfolio reset');
    const portfolio = defaultPortfolio();
    savePortfolio(portfolio);
    return mcpResult({ message: 'Portfolio reset to $100,000', cash: STARTING_CASH });
  },
);

// ── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`MCP server fatal: ${err.message}\n`);
  process.exit(1);
});

// Export for testing
if (typeof module !== 'undefined') {
  module.exports = {
    loadPortfolio, savePortfolio, defaultPortfolio,
    fetchQuote, searchSymbol, fetchOptionsChain,
    executeBuy, executeSell, getPortfolioView,
    STARTING_CASH, PORTFOLIO_PATH,
    clearQuoteCache: () => quoteCache.clear(),
  };
}
