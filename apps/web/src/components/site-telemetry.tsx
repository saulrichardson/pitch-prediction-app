import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { shouldRenderVercelTelemetry } from "./site-telemetry-config";

function getGaMeasurementId() {
  const raw = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  if (!raw) return null;

  if (!/^G-[A-Z0-9]+$/i.test(raw)) {
    throw new Error("NEXT_PUBLIC_GA_MEASUREMENT_ID must be a GA4 measurement ID like G-XXXXXXXXXX.");
  }

  return raw.toUpperCase();
}

export function SiteTelemetry() {
  const gaMeasurementId = getGaMeasurementId();
  const enableVercelTelemetry = shouldRenderVercelTelemetry();

  return (
    <>
      {gaMeasurementId ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaMeasurementId}', { anonymize_ip: true });`}
          </Script>
        </>
      ) : null}
      {enableVercelTelemetry ? (
        <>
          <Analytics />
          <SpeedInsights />
        </>
      ) : null}
    </>
  );
}
