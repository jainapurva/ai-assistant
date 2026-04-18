/**
 * Shopify OAuth2 + Admin API integration.
 *
 * Users authenticate via /shopify login <shop>.myshopify.com.
 * Tokens are stored per-user in shopify-tokens.json.
 * Supports: Products, Orders, Customers, Inventory, Discounts, Draft Orders.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

const TOKENS_FILE = path.join(config.stateDir, 'shopify-tokens.json');

const SHOPIFY_SCOPES = [
  'read_products', 'write_products',
  'read_orders', 'write_orders',
  'read_customers', 'write_customers',
  'read_inventory', 'write_inventory',
  'read_draft_orders', 'write_draft_orders',
  'read_price_rules', 'write_price_rules',
  'read_discounts', 'write_discounts',
  'read_locations',
].join(',');

const API_VERSION = '2024-10';

// -- Token persistence (read-every-time pattern) --

function loadTokens() {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    }
  } catch (e) {
    logger.warn('Failed to load Shopify tokens:', e.message);
  }
  return {};
}

function saveTokens(tokens) {
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
  } catch (e) {
    logger.warn('Failed to save Shopify tokens:', e.message);
  }
}

function getUserTokens(waId) {
  return loadTokens()[waId] || null;
}

function setUserTokens(waId, tokenData) {
  const tokens = loadTokens();
  tokens[waId] = tokenData;
  saveTokens(tokens);
}

function removeUserTokens(waId) {
  const tokens = loadTokens();
  delete tokens[waId];
  saveTokens(tokens);
}

// -- Configuration check --

function isConfigured() {
  return !!(config.shopifyClientId && config.shopifyClientSecret && config.shopifyRedirectUri);
}

// -- OAuth state encryption (maps callback back to waId + shop) --

function getEncryptionKey() {
  return crypto.createHash('sha256').update(config.metaAppSecret || 'shopify-oauth-fallback').digest();
}

function encryptState(waId, shop) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const payload = JSON.stringify({ waId, shop, ts: Date.now() });
  let encrypted = cipher.update(payload, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptState(stateStr) {
  try {
    const key = getEncryptionKey();
    const [ivHex, encrypted] = stateStr.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    const payload = JSON.parse(decrypted);

    // Reject state older than 10 minutes
    if (Date.now() - payload.ts > 10 * 60 * 1000) {
      logger.warn('Shopify OAuth state expired');
      return null;
    }
    return payload;
  } catch (e) {
    logger.warn('Failed to decrypt Shopify OAuth state:', e.message);
    return null;
  }
}

// -- Normalize shop domain --

function normalizeShop(shop) {
  // Accept "mystore", "mystore.myshopify.com", "https://mystore.myshopify.com"
  shop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!shop.includes('.')) {
    shop = `${shop}.myshopify.com`;
  }
  return shop;
}

// -- Public API: OAuth --

function getAuthUrl(waId, shop) {
  shop = normalizeShop(shop);
  const state = encryptState(waId, shop);
  const params = new URLSearchParams({
    client_id: config.shopifyClientId,
    scope: SHOPIFY_SCOPES,
    redirect_uri: config.shopifyRedirectUri,
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${params}`;
}

/**
 * Verify HMAC signature from Shopify callback.
 */
function verifyHmac(query) {
  const { hmac, ...params } = query;
  if (!hmac) return false;

  const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  const computed = crypto.createHmac('sha256', config.shopifyClientSecret).update(sorted).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hmac, 'hex'));
}

/**
 * Handle OAuth2 callback -- exchange code for access token, store it.
 * Returns { waId, shop }.
 */
async function handleCallback(code, state, shop, hmacQuery) {
  // Verify HMAC
  if (hmacQuery && !verifyHmac(hmacQuery)) {
    throw new Error('Invalid HMAC signature. Possible tampering.');
  }

  const payload = decryptState(state);
  if (!payload) {
    throw new Error('Invalid or expired OAuth state. Please try /shopify login again.');
  }

  shop = normalizeShop(shop || payload.shop);

  // Exchange code for expiring access token
  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.shopifyClientId,
      client_secret: config.shopifyClientSecret,
      code,
      expiring: 1,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Token exchange failed: ${text}`);
  }

  const tokenData = await tokenRes.json();

  // Get shop info
  let shopName = shop;
  try {
    const infoRes = await shopifyFetch(shop, tokenData.access_token, '/shop.json');
    shopName = infoRes.shop?.name || shop;
  } catch (e) {
    logger.warn('Failed to fetch shop info:', e.message);
  }

  const now = Date.now();
  setUserTokens(payload.waId, {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || null,
    expires_at: tokenData.expires_in ? now + tokenData.expires_in * 1000 : null,
    scope: tokenData.scope,
    shop,
    shopName,
    connectedAt: new Date().toISOString(),
  });

  logger.info(`Shopify connected for ${payload.waId}: ${shop}`);
  return { waId: payload.waId, shop, shopName };
}

// -- Shopify REST API helper --

async function shopifyFetch(shop, accessToken, endpoint, options = {}) {
  const url = `https://${shop}/admin/api/${API_VERSION}${endpoint}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const errMsg = data.errors
      ? (typeof data.errors === 'string' ? data.errors : JSON.stringify(data.errors))
      : `HTTP ${res.status}`;
    throw new Error(errMsg);
  }

  return data;
}

/**
 * Refresh an expiring access token using the refresh token.
 */
async function refreshAccessToken(waId) {
  const tokenData = getUserTokens(waId);
  if (!tokenData?.refresh_token) {
    throw new Error('No refresh token available. Please reconnect with /shopify login <shop>.');
  }

  const res = await fetch(`https://${tokenData.shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.shopifyClientId,
      client_secret: config.shopifyClientSecret,
      grant_type: 'refresh_token',
      refresh_token: tokenData.refresh_token,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${text}. Please reconnect with /shopify login <shop>.`);
  }

  const newTokenData = await res.json();
  const now = Date.now();

  setUserTokens(waId, {
    ...tokenData,
    access_token: newTokenData.access_token,
    refresh_token: newTokenData.refresh_token || tokenData.refresh_token,
    expires_at: newTokenData.expires_in ? now + newTokenData.expires_in * 1000 : null,
  });

  logger.info(`Shopify token refreshed for ${waId}`);
  return newTokenData.access_token;
}

/**
 * Authenticated Shopify API call for a user. Auto-refreshes expiring tokens.
 */
async function apiCall(waId, endpoint, options = {}) {
  let tokenData = getUserTokens(waId);
  if (!tokenData) throw new Error('Shopify not connected. Use /shopify login <shop> first.');

  // Auto-refresh if token expires within 5 minutes
  if (tokenData.expires_at && Date.now() > tokenData.expires_at - 5 * 60 * 1000) {
    const newToken = await refreshAccessToken(waId);
    tokenData = { ...tokenData, access_token: newToken };
  }

  return shopifyFetch(tokenData.shop, tokenData.access_token, endpoint, options);
}

// -- Public API: Products --

async function listProducts(waId, limit = 20) {
  const data = await apiCall(waId, `/products.json?limit=${limit}&status=active`);
  return (data.products || []).map(p => ({
    id: p.id,
    title: p.title,
    status: p.status,
    vendor: p.vendor,
    productType: p.product_type,
    price: p.variants?.[0]?.price || null,
    inventory: p.variants?.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0) || 0,
    variants: p.variants?.length || 0,
    image: p.image?.src || null,
    handle: p.handle,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }));
}

async function getProduct(waId, productId) {
  const data = await apiCall(waId, `/products/${productId}.json`);
  const p = data.product;
  return {
    id: p.id,
    title: p.title,
    bodyHtml: p.body_html,
    vendor: p.vendor,
    productType: p.product_type,
    status: p.status,
    tags: p.tags,
    variants: (p.variants || []).map(v => ({
      id: v.id,
      title: v.title,
      price: v.price,
      sku: v.sku,
      inventoryQuantity: v.inventory_quantity,
      inventoryItemId: v.inventory_item_id,
    })),
    images: (p.images || []).map(i => ({ id: i.id, src: i.src })),
    handle: p.handle,
  };
}

async function createProduct(waId, productData) {
  const data = await apiCall(waId, '/products.json', {
    method: 'POST',
    body: { product: productData },
  });
  const p = data.product;
  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    status: p.status,
    variants: (p.variants || []).map(v => ({
      id: v.id, title: v.title, price: v.price, sku: v.sku,
    })),
  };
}

async function updateProduct(waId, productId, productData) {
  const data = await apiCall(waId, `/products/${productId}.json`, {
    method: 'PUT',
    body: { product: { id: productId, ...productData } },
  });
  return { id: data.product.id, title: data.product.title, status: data.product.status };
}

async function updateVariant(waId, variantId, variantData) {
  const data = await apiCall(waId, `/variants/${variantId}.json`, {
    method: 'PUT',
    body: { variant: { id: variantId, ...variantData } },
  });
  const v = data.variant;
  return { id: v.id, title: v.title, price: v.price, sku: v.sku };
}

async function deleteProduct(waId, productId) {
  await apiCall(waId, `/products/${productId}.json`, { method: 'DELETE' });
  return { deleted: true, productId };
}

// -- Public API: Orders --

async function listOrders(waId, status = 'any', limit = 20) {
  const data = await apiCall(waId, `/orders.json?status=${status}&limit=${limit}`);
  return (data.orders || []).map(o => ({
    id: o.id,
    name: o.name,
    email: o.email,
    totalPrice: o.total_price,
    currency: o.currency,
    financialStatus: o.financial_status,
    fulfillmentStatus: o.fulfillment_status,
    itemCount: o.line_items?.length || 0,
    createdAt: o.created_at,
    customer: o.customer ? { name: `${o.customer.first_name} ${o.customer.last_name}`, email: o.customer.email } : null,
  }));
}

async function getOrder(waId, orderId) {
  const data = await apiCall(waId, `/orders/${orderId}.json`);
  const o = data.order;
  return {
    id: o.id,
    name: o.name,
    email: o.email,
    totalPrice: o.total_price,
    subtotalPrice: o.subtotal_price,
    totalTax: o.total_tax,
    currency: o.currency,
    financialStatus: o.financial_status,
    fulfillmentStatus: o.fulfillment_status,
    lineItems: (o.line_items || []).map(i => ({
      id: i.id, title: i.title, quantity: i.quantity, price: i.price, sku: i.sku,
    })),
    shippingAddress: o.shipping_address,
    customer: o.customer ? {
      id: o.customer.id,
      name: `${o.customer.first_name} ${o.customer.last_name}`,
      email: o.customer.email,
    } : null,
    createdAt: o.created_at,
    note: o.note,
  };
}

async function fulfillOrder(waId, orderId, trackingNumber, trackingCompany) {
  // Get fulfillment orders first
  const foData = await apiCall(waId, `/orders/${orderId}/fulfillment_orders.json`);
  const fulfillmentOrders = foData.fulfillment_orders || [];
  const openFO = fulfillmentOrders.find(fo => fo.status === 'open');
  if (!openFO) throw new Error('No open fulfillment orders found for this order.');

  const lineItems = openFO.line_items.map(li => ({
    id: li.id,
    quantity: li.fulfillable_quantity,
  }));

  const fulfillmentBody = {
    fulfillment: {
      line_items_by_fulfillment_order: [{
        fulfillment_order_id: openFO.id,
        fulfillment_order_line_items: lineItems,
      }],
    },
  };

  if (trackingNumber) {
    fulfillmentBody.fulfillment.tracking_info = {
      number: trackingNumber,
      company: trackingCompany || '',
    };
  }

  const data = await apiCall(waId, '/fulfillments.json', {
    method: 'POST',
    body: fulfillmentBody,
  });

  return {
    id: data.fulfillment.id,
    status: data.fulfillment.status,
    trackingNumber: data.fulfillment.tracking_number,
    trackingCompany: data.fulfillment.tracking_company,
  };
}

async function cancelOrder(waId, orderId, reason) {
  const data = await apiCall(waId, `/orders/${orderId}/cancel.json`, {
    method: 'POST',
    body: reason ? { reason } : {},
  });
  return { id: data.order?.id || orderId, status: 'cancelled' };
}

// -- Public API: Customers --

async function listCustomers(waId, query, limit = 20) {
  const endpoint = query
    ? `/customers/search.json?query=${encodeURIComponent(query)}&limit=${limit}`
    : `/customers.json?limit=${limit}`;
  const data = await apiCall(waId, endpoint);
  return (data.customers || []).map(c => ({
    id: c.id,
    firstName: c.first_name,
    lastName: c.last_name,
    email: c.email,
    phone: c.phone,
    ordersCount: c.orders_count,
    totalSpent: c.total_spent,
    createdAt: c.created_at,
  }));
}

async function getCustomer(waId, customerId) {
  const data = await apiCall(waId, `/customers/${customerId}.json`);
  const c = data.customer;
  return {
    id: c.id,
    firstName: c.first_name,
    lastName: c.last_name,
    email: c.email,
    phone: c.phone,
    ordersCount: c.orders_count,
    totalSpent: c.total_spent,
    addresses: c.addresses,
    tags: c.tags,
    note: c.note,
    createdAt: c.created_at,
  };
}

// -- Public API: Inventory --

async function listLocations(waId) {
  const data = await apiCall(waId, '/locations.json');
  return (data.locations || []).map(l => ({
    id: l.id,
    name: l.name,
    active: l.active,
    address1: l.address1,
    city: l.city,
    country: l.country,
  }));
}

async function setInventory(waId, inventoryItemId, locationId, quantity) {
  const data = await apiCall(waId, '/inventory_levels/set.json', {
    method: 'POST',
    body: { location_id: locationId, inventory_item_id: inventoryItemId, available: quantity },
  });
  return {
    inventoryItemId: data.inventory_level.inventory_item_id,
    locationId: data.inventory_level.location_id,
    available: data.inventory_level.available,
  };
}

// -- Public API: Discount Codes --

async function createDiscount(waId, { title, code, valueType, value, startsAt, endsAt, usageLimit }) {
  // Create price rule first
  const priceRuleBody = {
    price_rule: {
      title: title || code,
      target_type: 'line_item',
      target_selection: 'all',
      allocation_method: 'across',
      value_type: valueType || 'percentage', // 'percentage' or 'fixed_amount'
      value: `-${Math.abs(parseFloat(value))}`,
      customer_selection: 'all',
      starts_at: startsAt || new Date().toISOString(),
    },
  };
  if (endsAt) priceRuleBody.price_rule.ends_at = endsAt;
  if (usageLimit) priceRuleBody.price_rule.usage_limit = usageLimit;

  const prData = await apiCall(waId, '/price_rules.json', {
    method: 'POST',
    body: priceRuleBody,
  });

  const priceRuleId = prData.price_rule.id;

  // Create discount code
  const dcData = await apiCall(waId, `/price_rules/${priceRuleId}/discount_codes.json`, {
    method: 'POST',
    body: { discount_code: { code: code.toUpperCase() } },
  });

  return {
    priceRuleId,
    discountCodeId: dcData.discount_code.id,
    code: dcData.discount_code.code,
    valueType: prData.price_rule.value_type,
    value: prData.price_rule.value,
    startsAt: prData.price_rule.starts_at,
    endsAt: prData.price_rule.ends_at,
    usageLimit: prData.price_rule.usage_limit,
  };
}

async function listDiscounts(waId, limit = 20) {
  const data = await apiCall(waId, `/price_rules.json?limit=${limit}`);
  const results = [];
  for (const pr of (data.price_rules || [])) {
    try {
      const dcData = await apiCall(waId, `/price_rules/${pr.id}/discount_codes.json`);
      const codes = (dcData.discount_codes || []).map(dc => dc.code);
      results.push({
        priceRuleId: pr.id,
        title: pr.title,
        valueType: pr.value_type,
        value: pr.value,
        codes,
        startsAt: pr.starts_at,
        endsAt: pr.ends_at,
        usageLimit: pr.usage_limit,
      });
    } catch {
      results.push({
        priceRuleId: pr.id,
        title: pr.title,
        valueType: pr.value_type,
        value: pr.value,
        codes: [],
      });
    }
  }
  return results;
}

// -- Public API: Draft Orders --

async function createDraftOrder(waId, draftData) {
  const data = await apiCall(waId, '/draft_orders.json', {
    method: 'POST',
    body: { draft_order: draftData },
  });
  const d = data.draft_order;
  return {
    id: d.id,
    name: d.name,
    status: d.status,
    totalPrice: d.total_price,
    invoiceUrl: d.invoice_url,
    lineItems: (d.line_items || []).map(i => ({ title: i.title, quantity: i.quantity, price: i.price })),
  };
}

// -- Public API: Shop Info --

async function getShopInfo(waId) {
  const data = await apiCall(waId, '/shop.json');
  const s = data.shop;
  return {
    name: s.name,
    email: s.email,
    domain: s.domain,
    myshopifyDomain: s.myshopify_domain,
    plan: s.plan_display_name,
    country: s.country_name,
    currency: s.currency,
    timezone: s.iana_timezone,
  };
}

// -- Status --

function getStatus(waId) {
  const tokenData = getUserTokens(waId);
  if (!tokenData) return { connected: false };
  return {
    connected: true,
    shop: tokenData.shop,
    shopName: tokenData.shopName,
    connectedAt: tokenData.connectedAt,
  };
}

module.exports = {
  // OAuth
  isConfigured,
  getAuthUrl,
  handleCallback,
  verifyHmac,
  getUserTokens,
  setUserTokens,
  removeUserTokens,
  getStatus,
  normalizeShop,
  // Products
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  updateVariant,
  deleteProduct,
  // Orders
  listOrders,
  getOrder,
  fulfillOrder,
  cancelOrder,
  // Customers
  listCustomers,
  getCustomer,
  // Inventory
  listLocations,
  setInventory,
  // Discounts
  createDiscount,
  listDiscounts,
  // Draft Orders
  createDraftOrder,
  // Shop
  getShopInfo,
};
