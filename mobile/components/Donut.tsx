import Svg, { Circle, G } from "react-native-svg";

export type DonutSlice = { value: number; color: string };

/**
 * Minimal donut chart built on react-native-svg — no extra chart lib needed.
 * Renders each slice as a stroked circle segment via strokeDasharray.
 */
export function Donut({
  data,
  size = 170,
  strokeWidth = 22,
}: {
  data: DonutSlice[];
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * radius;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let offset = 0;

  return (
    <Svg width={size} height={size}>
      <G rotation={-90} originX={size / 2} originY={size / 2}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {data.map((d, i) => {
          const dash = (d.value / total) * circ;
          const seg = (
            <Circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={d.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += dash;
          return seg;
        })}
      </G>
    </Svg>
  );
}
