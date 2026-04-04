const fs = require('fs');
const path = require('path');
const os = require('os');

// Use a temp file for portfolio during tests
const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'trading-test-'));
const PORTFOLIO_FILE = path.join(TEMP_DIR, 'portfolio.json');
process.env.PORTFOLIO_PATH = PORTFOLIO_FILE;

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Now require the module (after env is set)
const {
  loadPortfolio, savePortfolio, defaultPortfolio,
  executeBuy, executeSell, getPortfolioView,
  STARTING_CASH, clearQuoteCache,
} = require('../../src/mcp/trading-mcp-server');

function mockQuoteResponse(symbol, price, prevClose) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      chart: {
        result: [{
          meta: {
            regularMarketPrice: price,
            chartPreviousClose: prevClose || price,
            shortName: `${symbol} Inc`,
            currency: 'USD',
            exchangeName: 'NASDAQ',
            marketState: 'REGULAR',
          },
        }],
      },
    }),
  };
}

beforeEach(() => {
  // Clean portfolio file and quote cache before each test
  if (fs.existsSync(PORTFOLIO_FILE)) fs.unlinkSync(PORTFOLIO_FILE);
  mockFetch.mockReset();
  clearQuoteCache();
});

afterAll(() => {
  // Clean up temp dir
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
});

describe('Portfolio Management', () => {
  test('initializes with $100,000 when no file exists', () => {
    const portfolio = loadPortfolio();
    expect(portfolio.cash).toBe(100_000);
    expect(portfolio.positions).toEqual([]);
    expect(portfolio.trades).toEqual([]);
    expect(portfolio.createdAt).toBeDefined();
  });

  test('saves and loads portfolio correctly', () => {
    const portfolio = defaultPortfolio();
    portfolio.cash = 50_000;
    portfolio.positions.push({ symbol: 'AAPL', type: 'stock', quantity: 10, avgCostBasis: 150 });
    savePortfolio(portfolio);

    const loaded = loadPortfolio();
    expect(loaded.cash).toBe(50_000);
    expect(loaded.positions).toHaveLength(1);
    expect(loaded.positions[0].symbol).toBe('AAPL');
  });

  test('STARTING_CASH is $100,000', () => {
    expect(STARTING_CASH).toBe(100_000);
  });
});

describe('Buy Trades', () => {
  test('buys stock and reduces cash', async () => {
    mockFetch.mockResolvedValue(mockQuoteResponse('AAPL', 175.00));
    const portfolio = defaultPortfolio();
    savePortfolio(portfolio);

    const result = await executeBuy(loadPortfolio(), 'AAPL', 10, 'stock');

    expect(result.action).toBe('BUY');
    expect(result.symbol).toBe('AAPL');
    expect(result.quantity).toBe(10);
    expect(result.price).toBe(175);
    expect(result.total).toBe(1750);
    expect(result.cashRemaining).toBe(100_000 - 1750);

    // Verify persisted
    const saved = loadPortfolio();
    expect(saved.positions).toHaveLength(1);
    expect(saved.positions[0].symbol).toBe('AAPL');
    expect(saved.positions[0].quantity).toBe(10);
    expect(saved.trades).toHaveLength(1);
  });

  test('averages into existing position', async () => {
    mockFetch.mockResolvedValue(mockQuoteResponse('AAPL', 200.00));
    const portfolio = defaultPortfolio();
    portfolio.positions.push({ symbol: 'AAPL', type: 'stock', quantity: 10, avgCostBasis: 150, openedAt: new Date().toISOString() });
    portfolio.cash = 90_000;
    savePortfolio(portfolio);

    const result = await executeBuy(loadPortfolio(), 'AAPL', 10, 'stock');

    const saved = loadPortfolio();
    expect(saved.positions[0].quantity).toBe(20);
    // Average cost: (150*10 + 200*10) / 20 = 175
    expect(saved.positions[0].avgCostBasis).toBe(175);
  });

  test('rejects buy when insufficient funds', async () => {
    mockFetch.mockResolvedValue(mockQuoteResponse('AAPL', 175.00));
    const portfolio = defaultPortfolio();
    portfolio.cash = 100; // only $100
    savePortfolio(portfolio);

    await expect(executeBuy(loadPortfolio(), 'AAPL', 10, 'stock'))
      .rejects.toThrow(/Insufficient funds/);
  });

  test('options buy multiplies by 100', async () => {
    mockFetch.mockResolvedValue(mockQuoteResponse('AAPL250418C00200000', 5.00));
    const portfolio = defaultPortfolio();
    savePortfolio(portfolio);

    const result = await executeBuy(loadPortfolio(), 'AAPL250418C00200000', 2, 'option');

    // 2 contracts * $5 * 100 = $1000
    expect(result.total).toBe(1000);
    expect(result.cashRemaining).toBe(99_000);
  });

  test('crypto buy works like stock', async () => {
    mockFetch.mockResolvedValue(mockQuoteResponse('BTC-USD', 65000));
    const portfolio = defaultPortfolio();
    savePortfolio(portfolio);

    const result = await executeBuy(loadPortfolio(), 'BTC-USD', 1, 'crypto');

    expect(result.total).toBe(65000);
    expect(result.cashRemaining).toBe(35_000);
    expect(result.type).toBe('crypto');
  });
});

describe('Sell Trades', () => {
  test('sells stock and adds cash', async () => {
    mockFetch.mockResolvedValue(mockQuoteResponse('AAPL', 200.00));
    const portfolio = defaultPortfolio();
    portfolio.positions.push({ symbol: 'AAPL', type: 'stock', quantity: 10, avgCostBasis: 150, openedAt: new Date().toISOString() });
    portfolio.cash = 90_000;
    savePortfolio(portfolio);

    const result = await executeSell(loadPortfolio(), 'AAPL', 10, 'stock');

    expect(result.action).toBe('SELL');
    expect(result.quantity).toBe(10);
    expect(result.price).toBe(200);
    expect(result.total).toBe(2000);
    expect(result.realizedPnL).toBe(500); // (200-150)*10
    expect(result.cashRemaining).toBe(92_000);

    const saved = loadPortfolio();
    expect(saved.positions).toHaveLength(0);
  });

  test('partial sell reduces quantity', async () => {
    mockFetch.mockResolvedValue(mockQuoteResponse('AAPL', 200.00));
    const portfolio = defaultPortfolio();
    portfolio.positions.push({ symbol: 'AAPL', type: 'stock', quantity: 10, avgCostBasis: 150, openedAt: new Date().toISOString() });
    portfolio.cash = 90_000;
    savePortfolio(portfolio);

    await executeSell(loadPortfolio(), 'AAPL', 5, 'stock');

    const saved = loadPortfolio();
    expect(saved.positions).toHaveLength(1);
    expect(saved.positions[0].quantity).toBe(5);
    expect(saved.positions[0].avgCostBasis).toBe(150); // cost basis preserved
  });

  test('rejects sell when no position', async () => {
    const portfolio = defaultPortfolio();
    savePortfolio(portfolio);

    await expect(executeSell(loadPortfolio(), 'AAPL', 10, 'stock'))
      .rejects.toThrow(/No stock position found/);
  });

  test('rejects sell when quantity exceeds held', async () => {
    mockFetch.mockResolvedValue(mockQuoteResponse('AAPL', 200.00));
    const portfolio = defaultPortfolio();
    portfolio.positions.push({ symbol: 'AAPL', type: 'stock', quantity: 5, avgCostBasis: 150, openedAt: new Date().toISOString() });
    savePortfolio(portfolio);

    await expect(executeSell(loadPortfolio(), 'AAPL', 10, 'stock'))
      .rejects.toThrow(/Cannot sell 10/);
  });
});

describe('Portfolio View', () => {
  test('shows correct P&L for positions', async () => {
    mockFetch.mockResolvedValue(mockQuoteResponse('AAPL', 200.00, 195.00));
    const portfolio = defaultPortfolio();
    portfolio.positions.push({ symbol: 'AAPL', type: 'stock', quantity: 10, avgCostBasis: 150, openedAt: new Date().toISOString() });
    portfolio.cash = 98_500;
    savePortfolio(portfolio);

    const view = await getPortfolioView(loadPortfolio());

    expect(view.cash).toBe(98_500);
    expect(view.positions).toHaveLength(1);
    expect(view.positions[0].currentPrice).toBe(200);
    expect(view.positions[0].unrealizedPnL).toBe(500); // (200-150)*10
    expect(view.totalValue).toBe(100_500); // 98500 + 2000
    expect(view.totalPnL).toBe(500);
    expect(view.startingBalance).toBe(100_000);
  });

  test('empty portfolio shows starting balance', async () => {
    const portfolio = defaultPortfolio();
    savePortfolio(portfolio);

    const view = await getPortfolioView(loadPortfolio());

    expect(view.cash).toBe(100_000);
    expect(view.positions).toEqual([]);
    expect(view.totalValue).toBe(100_000);
    expect(view.totalPnL).toBe(0);
  });
});

describe('Trade History', () => {
  test('records trades in order', async () => {
    mockFetch.mockResolvedValue(mockQuoteResponse('AAPL', 175.00));
    const portfolio = defaultPortfolio();
    savePortfolio(portfolio);

    await executeBuy(loadPortfolio(), 'AAPL', 5, 'stock');

    mockFetch.mockResolvedValue(mockQuoteResponse('TSLA', 250.00));
    await executeBuy(loadPortfolio(), 'TSLA', 3, 'stock');

    const saved = loadPortfolio();
    expect(saved.trades).toHaveLength(2);
    expect(saved.trades[0].symbol).toBe('AAPL');
    expect(saved.trades[1].symbol).toBe('TSLA');
  });
});
