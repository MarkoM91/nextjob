export type PaymentModel = "pay_per_download" | "monthly_subscription";
export type BillingCatalog = {
  currency: string;
  download: { productId: string; amountCents: number; label: string; redownloadDays: number };
  subscription: { productId: string; amountCents: number; label: string; enabled: boolean };
};

function integer(name: string, fallback: number, min: number, max: number): number {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`Invalid billing configuration: ${name}`);
  return parsed;
}

export function moneyLabel(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: 2 }).format(amountCents / 100);
}

/** Server-owned pricing. Amounts and product IDs supplied by a browser are never accepted. */
export function billingCatalog(): BillingCatalog {
  const currency = (process.env.BILLING_CURRENCY || "eur").trim().toLowerCase();
  if (!/^[a-z]{3}$/.test(currency)) throw new Error("Invalid billing currency");
  const downloadAmount = integer("CV_DOWNLOAD_PRICE_CENTS", 150, 50, 100000);
  const subscriptionAmount = integer("MONTHLY_SUBSCRIPTION_PRICE_CENTS", 200, 50, 100000);
  return {
    currency,
    download: { productId: process.env.CV_DOWNLOAD_PRODUCT_ID?.trim() || "cv_download", amountCents: downloadAmount, label: moneyLabel(downloadAmount, currency), redownloadDays: integer("CV_REDOWNLOAD_DAYS", 7, 1, 365) },
    subscription: { productId: process.env.MONTHLY_SUBSCRIPTION_PRODUCT_ID?.trim() || "monthly_subscription", amountCents: subscriptionAmount, label: moneyLabel(subscriptionAmount, currency), enabled: process.env.MONTHLY_SUBSCRIPTIONS_ENABLED === "true" },
  };
}
