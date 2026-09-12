import type { PitchLocation, StrikeZoneBounds } from "@pitch/domain";
import { plotPosition, plotX as x, plotY as y } from "./plot-position";
export function PitchPlot({
  forecast,
  actual,
  zone,
}: {
  forecast: PitchLocation;
  actual: PitchLocation | null;
  zone: StrikeZoneBounds;
}) {
  const expectedPoint = plotPosition(forecast);
  const actualPoint = plotPosition(actual);
  const note =
    !expectedPoint || (actual && !actualPoint)
      ? `${!expectedPoint ? "Forecast" : "Actual"} location unavailable`
      : expectedPoint.outside || actualPoint?.outside
        ? "Triangle marks a pitch beyond the plot"
        : null;
  return (
    <div className="pitch-plot">
      <svg
        viewBox="0 0 320 330"
        role="img"
        aria-label={`Strike zone from the catcher's view. Forecast: ${forecast.label}.${actual ? ` Actual: ${actual.label}.` : ""}${note ? ` ${note}.` : ""}`}
      >
        <rect
          x={x(-17 / 24)}
          y={y(zone.top)}
          width={(80 * 17) / 12}
          height={(zone.top - zone.bottom) * 80}
          rx="1"
          className="plot-zone"
        />
        {[1, 2].map((n) => (
          <g key={n} className="plot-zone-lines">
            <line
              x1={x(-17 / 24 + (n * 17) / 36)}
              x2={x(-17 / 24 + (n * 17) / 36)}
              y1={y(zone.top)}
              y2={y(zone.bottom)}
            />
            <line
              x1={x(-17 / 24)}
              x2={x(17 / 24)}
              y1={y(zone.bottom + ((zone.top - zone.bottom) * n) / 3)}
              y2={y(zone.bottom + ((zone.top - zone.bottom) * n) / 3)}
            />
          </g>
        ))}
        <path
          d="M137 298 H183 V311 L160 323 L137 311 Z"
          className="home-plate"
        />
        {expectedPoint && actualPoint ? (
          <line
            x1={expectedPoint.x}
            y1={expectedPoint.y}
            x2={actualPoint.x}
            y2={actualPoint.y}
            className="plot-distance"
          />
        ) : null}
        {[
          { point: expectedPoint, kind: "forecast" },
          { point: actualPoint, kind: "actual" },
        ].map(({ point, kind }) =>
          point ? (
            <g
              key={kind}
              className={`plot-${kind}`}
              transform={`translate(${point.x} ${point.y})`}
            >
              {point.outside ? (
                <path
                  d="M0 -7 L6 5 L-6 5 Z"
                  transform={`rotate(${point.angle})`}
                />
              ) : (
                <>
                  {kind === "forecast" ? (
                    <circle r="16" opacity="0.12" />
                  ) : null}
                  <circle r={kind === "forecast" ? 6 : 7} />
                  {kind === "actual" ? (
                    <circle r="2" className="plot-actual-center" />
                  ) : null}
                </>
              )}
            </g>
          ) : null,
        )}
      </svg>
      <div className="plot-legend">
        <span>
          <i />
          Forecast
        </span>
        <span className={actual ? "" : "muted"}>
          <i className="actual-key" />
          Actual
        </span>
      </div>
      <p className="plot-caption">Catcher’s view</p>
      {note ? <p className="plot-missing">{note}</p> : null}
    </div>
  );
}
