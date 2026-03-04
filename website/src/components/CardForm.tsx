"use client";

import { CreditCard, PaymentForm } from "react-square-web-payments-sdk";

interface CardFormProps {
  onTokenized: (token: string) => void;
  submitting: boolean;
}

export default function CardForm({ onTokenized, submitting }: CardFormProps) {
  const appId = process.env.NEXT_PUBLIC_SQUARE_APP_ID || "";
  const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID || "";

  return (
    <div className="space-y-3">
      <PaymentForm
        applicationId={appId}
        locationId={locationId}
        cardTokenizeResponseReceived={(token) => {
          if (token.status === "OK" && token.token) {
            onTokenized(token.token);
          }
        }}
      >
        <CreditCard
          buttonProps={{
            isLoading: submitting,
            css: {
              backgroundColor: "var(--color-primary, #6d28d9)",
              color: "#fff",
              fontSize: "1.125rem",
              fontWeight: "600",
              "&:hover": {
                backgroundColor: "var(--color-primary-dark, #5b21b6)",
              },
            },
          }}
        >
          {submitting ? "Processing..." : "Start Free Trial"}
        </CreditCard>
      </PaymentForm>
      <p className="text-center text-sm text-gray-400">
        Your card will not be charged during the 3-month free trial.
      </p>
    </div>
  );
}
