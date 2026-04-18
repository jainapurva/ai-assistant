#!/usr/bin/env node

/**
 * Shopify MCP Server -- stdio proxy for Shopify Admin API.
 *
 * Reads CHAT_ID and BOT_API_URL from env vars, exposes MCP tools that
 * proxy to the bot's existing HTTP API endpoints via fetch().
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

const CHAT_ID = process.env.CHAT_ID;
const BOT_API_URL = process.env.BOT_API_URL;

if (!CHAT_ID || !BOT_API_URL) {
  process.stderr.write('ERROR: CHAT_ID and BOT_API_URL env vars are required\n');
  process.exit(1);
}

async function apiCall(endpoint, params) {
  const url = `${BOT_API_URL}${endpoint}`;
  const body = JSON.stringify({ chatId: CHAT_ID, ...params });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const msg = data.error || `HTTP ${res.status}: ${text.slice(0, 200)}`;
    throw new Error(msg);
  }

  return data;
}

function toolHandler(endpoint, paramsFn) {
  return async (params) => {
    try {
      const result = await apiCall(endpoint, paramsFn(params));
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  };
}

const server = new McpServer({
  name: 'shopify',
  version: '1.0.0',
});

// -- Shop Info --

server.tool(
  'shopify_shop_info',
  'Get Shopify store information (name, domain, plan, currency)',
  {},
  toolHandler('/shopify/shop', () => ({})),
);

// -- Products --

server.tool(
  'shopify_list_products',
  'List products in the Shopify store',
  { limit: z.number().optional().describe('Max products to return (default 20)') },
  toolHandler('/shopify/products', ({ limit }) => ({ limit })),
);

server.tool(
  'shopify_get_product',
  'Get detailed info about a specific product',
  { productId: z.string().describe('Shopify product ID') },
  toolHandler('/shopify/product', ({ productId }) => ({ productId })),
);

server.tool(
  'shopify_create_product',
  'Create a new product in the Shopify store. For variants with sizes/colors, set options and use option1/option2 on each variant.',
  {
    title: z.string().describe('Product title'),
    body_html: z.string().optional().describe('Product description in HTML'),
    vendor: z.string().optional().describe('Product vendor/brand'),
    product_type: z.string().optional().describe('Product type/category'),
    tags: z.string().optional().describe('Comma-separated tags'),
    options: z.array(z.object({
      name: z.string().describe('Option name (e.g. "Size", "Color")'),
    })).optional().describe('Product options like Size, Color'),
    variants: z.array(z.object({
      price: z.string().describe('Variant price'),
      sku: z.string().optional().describe('SKU'),
      option1: z.string().optional().describe('Value for first option (e.g. "S", "M", "L")'),
      option2: z.string().optional().describe('Value for second option (e.g. "Red", "Blue")'),
      option3: z.string().optional().describe('Value for third option'),
      inventory_quantity: z.number().optional().describe('Initial stock quantity'),
    })).optional().describe('Product variants (sizes, colors, etc.)'),
    status: z.enum(['active', 'draft', 'archived']).optional().describe('Product status (default: active)'),
  },
  toolHandler('/shopify/products/create', (params) => ({ product: params })),
);

server.tool(
  'shopify_update_product',
  'Update an existing product (title, description, price, status, etc.)',
  {
    productId: z.string().describe('Shopify product ID'),
    title: z.string().optional(),
    body_html: z.string().optional(),
    vendor: z.string().optional(),
    product_type: z.string().optional(),
    tags: z.string().optional(),
    status: z.enum(['active', 'draft', 'archived']).optional(),
  },
  toolHandler('/shopify/products/update', ({ productId, ...rest }) => ({ productId, product: rest })),
);

server.tool(
  'shopify_update_variant',
  'Update a product variant (price, SKU, title, etc.)',
  {
    variantId: z.string().describe('Shopify variant ID'),
    price: z.string().optional().describe('New price'),
    sku: z.string().optional().describe('New SKU'),
    title: z.string().optional().describe('New variant title'),
  },
  toolHandler('/shopify/variants/update', ({ variantId, ...rest }) => ({ variantId, variant: rest })),
);

server.tool(
  'shopify_delete_product',
  'Delete a product from the store',
  { productId: z.string().describe('Shopify product ID') },
  toolHandler('/shopify/products/delete', ({ productId }) => ({ productId })),
);

// -- Orders --

server.tool(
  'shopify_list_orders',
  'List orders (recent, open, closed, etc.)',
  {
    status: z.enum(['open', 'closed', 'cancelled', 'any']).optional().describe('Filter by status (default: any)'),
    limit: z.number().optional().describe('Max orders to return (default 20)'),
  },
  toolHandler('/shopify/orders', ({ status, limit }) => ({ status, limit })),
);

server.tool(
  'shopify_get_order',
  'Get detailed info about a specific order',
  { orderId: z.string().describe('Shopify order ID') },
  toolHandler('/shopify/order', ({ orderId }) => ({ orderId })),
);

server.tool(
  'shopify_fulfill_order',
  'Fulfill an order (mark as shipped with optional tracking)',
  {
    orderId: z.string().describe('Shopify order ID'),
    trackingNumber: z.string().optional().describe('Shipping tracking number'),
    trackingCompany: z.string().optional().describe('Shipping carrier name (e.g. "USPS", "FedEx", "UPS")'),
  },
  toolHandler('/shopify/orders/fulfill', ({ orderId, trackingNumber, trackingCompany }) => ({
    orderId, trackingNumber, trackingCompany,
  })),
);

server.tool(
  'shopify_cancel_order',
  'Cancel an order',
  {
    orderId: z.string().describe('Shopify order ID'),
    reason: z.string().optional().describe('Cancellation reason'),
  },
  toolHandler('/shopify/orders/cancel', ({ orderId, reason }) => ({ orderId, reason })),
);

// -- Customers --

server.tool(
  'shopify_list_customers',
  'List or search customers',
  {
    query: z.string().optional().describe('Search query (name, email, phone, etc.)'),
    limit: z.number().optional().describe('Max customers to return (default 20)'),
  },
  toolHandler('/shopify/customers', ({ query, limit }) => ({ query, limit })),
);

server.tool(
  'shopify_get_customer',
  'Get detailed info about a specific customer',
  { customerId: z.string().describe('Shopify customer ID') },
  toolHandler('/shopify/customer', ({ customerId }) => ({ customerId })),
);

// -- Inventory --

server.tool(
  'shopify_list_locations',
  'List inventory locations for the store',
  {},
  toolHandler('/shopify/locations', () => ({})),
);

server.tool(
  'shopify_set_inventory',
  'Set inventory quantity for a product variant at a location',
  {
    inventoryItemId: z.string().describe('Inventory item ID (from product variant)'),
    locationId: z.string().describe('Location ID'),
    quantity: z.number().describe('New available quantity'),
  },
  toolHandler('/shopify/inventory/set', ({ inventoryItemId, locationId, quantity }) => ({
    inventoryItemId, locationId, quantity,
  })),
);

// -- Discounts --

server.tool(
  'shopify_create_discount',
  'Create a discount code (percentage or fixed amount)',
  {
    code: z.string().describe('Discount code (e.g. "SUMMER20")'),
    valueType: z.enum(['percentage', 'fixed_amount']).describe('"percentage" for % off, "fixed_amount" for $ off'),
    value: z.number().describe('Discount value (e.g. 20 for 20% or 10 for $10)'),
    title: z.string().optional().describe('Internal title for the discount'),
    usageLimit: z.number().optional().describe('Max number of times this code can be used'),
    endsAt: z.string().optional().describe('Expiry date (ISO 8601)'),
  },
  toolHandler('/shopify/discounts/create', (params) => params),
);

server.tool(
  'shopify_list_discounts',
  'List active discount codes and price rules',
  { limit: z.number().optional().describe('Max discounts to return (default 20)') },
  toolHandler('/shopify/discounts', ({ limit }) => ({ limit })),
);

// -- Draft Orders --

server.tool(
  'shopify_create_draft_order',
  'Create a draft order (custom invoice or manual order)',
  {
    line_items: z.array(z.object({
      title: z.string().describe('Line item title'),
      price: z.string().describe('Price per unit'),
      quantity: z.number().describe('Quantity'),
    })).describe('Items in the draft order'),
    customer: z.object({
      id: z.number().optional(),
      email: z.string().optional(),
    }).optional().describe('Customer to associate'),
    note: z.string().optional().describe('Order note'),
  },
  toolHandler('/shopify/draft-orders/create', (params) => ({ draftOrder: params })),
);

// -- Start --

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Shopify MCP server fatal: ${err.message}\n`);
  process.exit(1);
});
