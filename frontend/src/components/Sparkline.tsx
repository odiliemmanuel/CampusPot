import { useId } from "react";

interface SparklineProps {
  /** Series of values, oldest → newest. */
  data: number[];
  /** Line + fill colour (any CSS colour). */
  stroke?: string;
  width?: number;
  height?: number;
  className?: string;
}

// A tiny dependency-free trend line. Kept as a plain SVG so it renders the same
// everywhere and costs nothing (no charting library).
export default function Sparkline({
  data,
  stroke = "#2F5BEA",
  width = 96,
  height = 36,
  className = "",
}: SparklineProps) {
  const gradientId = useId();
  if (data.length < 2) return null;

  const pad = 3;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const stepX = (width - pad * 2) / (data.length - 1);

  const points = data.map((value, i) => {
    const x = pad + i * stepX;
    const y = pad + (height - pad * 2) * (1 - (value - min) / span);
    return [x, y] as const;
  });

  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
