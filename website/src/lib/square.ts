import { SquareClient, SquareEnvironment, WebhooksHelper } from "square";

const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN || "",
  environment:
    process.env.SQUARE_ENVIRONMENT === "production"
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox,
});

const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID || "";

// Cached plan variation ID (survives for process lifetime)
let cachedPlanVariationId: string | null = null;

/**
 * Create a Square customer and attach a card on file.
 * Returns { customerId, cardId }.
 */
export async function createCustomerWithCard(
  phone: string,
  sourceId: string
): Promise<{ customerId: string; cardId: string }> {
  const customerResult = await client.customers.create({
    phoneNumber: phone,
    referenceId: phone,
  });
  const customerId = customerResult.customer!.id!;

  const cardResult = await client.cards.create({
    idempotencyKey: `card-${customerId}-${Date.now()}`,
    sourceId,
    card: {
      customerId,
    },
  });
  const cardId = cardResult.card!.id!;

  return { customerId, cardId };
}

/**
 * Find or create a "Swayat Pro" subscription plan ($9.99/month).
 * Caches the plan variation ID in memory.
 */
export async function getOrCreatePlanVariationId(): Promise<string> {
  if (cachedPlanVariationId) return cachedPlanVariationId;

  // Search for existing plan
  const searchResult = await client.catalog.search({
    objectTypes: ["SUBSCRIPTION_PLAN"],
    query: {
      exactQuery: {
        attributeName: "name",
        attributeValue: "Swayat Pro",
      },
    },
  });

  if (searchResult.objects && searchResult.objects.length > 0) {
    const plan = searchResult.objects[0];
    if (
      plan.type === "SUBSCRIPTION_PLAN" &&
      plan.subscriptionPlanData?.subscriptionPlanVariations?.[0]
    ) {
      const variation = plan.subscriptionPlanData.subscriptionPlanVariations[0];
      if (variation.id) {
        cachedPlanVariationId = variation.id;
        return cachedPlanVariationId;
      }
    }
  }

  // Create new plan
  const createResult = await client.catalog.object.upsert({
    idempotencyKey: `plan-swayat-pro-${Date.now()}`,
    object: {
      type: "SUBSCRIPTION_PLAN",
      id: "#swayat-pro",
      subscriptionPlanData: {
        name: "Swayat Pro",
        subscriptionPlanVariations: [
          {
            type: "SUBSCRIPTION_PLAN_VARIATION",
            id: "#swayat-pro-monthly",
            subscriptionPlanVariationData: {
              name: "Monthly",
              phases: [
                {
                  cadence: "MONTHLY",
                  recurringPriceMoney: {
                    amount: BigInt(999),
                    currency: "USD",
                  },
                },
              ],
            },
          },
        ],
      },
    },
  });

  const createdPlan = createResult.catalogObject!;
  if (
    createdPlan.type === "SUBSCRIPTION_PLAN" &&
    createdPlan.subscriptionPlanData?.subscriptionPlanVariations?.[0]
  ) {
    cachedPlanVariationId =
      createdPlan.subscriptionPlanData.subscriptionPlanVariations[0].id ?? null;
  }

  return cachedPlanVariationId!;
}

/**
 * Create a subscription that starts billing after the free trial period.
 * startDate should be YYYY-MM-DD for when billing begins.
 */
export async function createSubscription(
  customerId: string,
  cardId: string,
  startDate: string
): Promise<string> {
  const planVariationId = await getOrCreatePlanVariationId();

  const result = await client.subscriptions.create({
    idempotencyKey: `sub-${customerId}-${Date.now()}`,
    locationId,
    planVariationId,
    customerId,
    cardId,
    startDate,
  });

  return result.subscription!.id!;
}

/**
 * Verify a Square webhook signature.
 */
export async function verifyWebhookSignature(
  body: string,
  signature: string,
  signatureKey: string,
  notificationUrl: string
): Promise<boolean> {
  return WebhooksHelper.verifySignature({
    requestBody: body,
    signatureHeader: signature,
    signatureKey,
    notificationUrl,
  });
}

/**
 * Fetch a subscription from Square.
 */
export async function getSubscription(subscriptionId: string) {
  const result = await client.subscriptions.get({ subscriptionId });
  return result.subscription!;
}

/**
 * Cancel a subscription at end of current billing period.
 */
export async function cancelSubscription(subscriptionId: string) {
  const result = await client.subscriptions.cancel({ subscriptionId });
  return result.subscription!;
}

/**
 * Update the card on a subscription.
 */
export async function updateSubscriptionCard(
  subscriptionId: string,
  newCardId: string
) {
  const result = await client.subscriptions.update({
    subscriptionId,
    subscription: { cardId: newCardId },
  });
  return result.subscription!;
}

/**
 * Create a new card on file for an existing customer.
 */
export async function createCardOnFile(
  customerId: string,
  sourceId: string
): Promise<string> {
  const result = await client.cards.create({
    idempotencyKey: `card-${customerId}-${Date.now()}`,
    sourceId,
    card: { customerId },
  });
  return result.card!.id!;
}
