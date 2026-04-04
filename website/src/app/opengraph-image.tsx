import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Swayat AI — AI-Powered Business Tools on WhatsApp";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 50%, #06b6d4 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px",
        }}
      >
        {/* Logo mark */}
        <div
          style={{
            width: "80px",
            height: "80px",
            borderRadius: "20px",
            background: "rgba(255,255,255,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "30px",
          }}
        >
          <div
            style={{
              fontSize: "48px",
              fontWeight: 800,
              color: "white",
            }}
          >
            S
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: "56px",
            fontWeight: 800,
            color: "white",
            textAlign: "center",
            lineHeight: 1.2,
            marginBottom: "20px",
          }}
        >
          Swayat AI
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: "28px",
            fontWeight: 400,
            color: "rgba(255,255,255,0.9)",
            textAlign: "center",
            lineHeight: 1.4,
            maxWidth: "800px",
          }}
        >
          AI-Powered Business Tools on WhatsApp
        </div>

        {/* Feature pills */}
        <div
          style={{
            display: "flex",
            gap: "16px",
            marginTop: "40px",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {["Invoicing", "Booking", "Marketing", "Real Estate CRM", "Support"].map(
            (f) => (
              <div
                key={f}
                style={{
                  background: "rgba(255,255,255,0.15)",
                  borderRadius: "100px",
                  padding: "10px 24px",
                  fontSize: "18px",
                  color: "white",
                  fontWeight: 500,
                }}
              >
                {f}
              </div>
            )
          )}
        </div>

        {/* URL */}
        <div
          style={{
            position: "absolute",
            bottom: "30px",
            fontSize: "18px",
            color: "rgba(255,255,255,0.6)",
          }}
        >
          swayat.com
        </div>
      </div>
    ),
    { ...size }
  );
}
