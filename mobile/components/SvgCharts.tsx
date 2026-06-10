import { useWindowDimensions } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

// Compact number formatter for axis/value labels
function shortFmt(n: number): string {
  if (n >= 1_00_000) return `${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

/**
 * Vertical SVG bar chart — wraps react-native-svg, no extra lib needed.
 * Each bar gets a gradient fill, a value label on top, and an x-axis label.
 */
export function BarChart({
  data,
  height = 180,
  gradFrom = "#22d3ee",
  gradTo = "#0891b2",
  gradId = "bc_grad",
  showValues = true,
  padding = 64, // horizontal padding consumed by parent (screen padding × 2)
}: {
  data: { label: string; value: number }[];
  height?: number;
  gradFrom?: string;
  gradTo?: string;
  gradId?: string;
  showValues?: boolean;
  padding?: number;
}) {
  const { width } = useWindowDimensions();
  const svgW = Math.max(width - padding, 200);
  const padL = 4;
  const padR = 4;
  const padT = showValues ? 22 : 8;
  const padB = 20;
  const chartH = height - padT - padB;
  const chartW = svgW - padL - padR;
  const n = data.length || 1;
  const max = Math.max(...data.map((d) => d.value), 1);
  const slotW = chartW / n;
  const barW = Math.max(slotW * 0.62, 6);

  return (
    <Svg width={svgW} height={height}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={gradFrom} stopOpacity={0.95} />
          <Stop offset="100%" stopColor={gradTo} stopOpacity={0.45} />
        </LinearGradient>
      </Defs>

      {/* baseline */}
      <Line
        x1={padL}
        y1={padT + chartH}
        x2={svgW - padR}
        y2={padT + chartH}
        stroke="#27272a"
        strokeWidth={1}
      />

      {data.map((d, i) => {
        const barH = Math.max(2, (d.value / max) * chartH);
        const x = padL + i * slotW + (slotW - barW) / 2;
        const y = padT + chartH - barH;
        return (
          <G key={i}>
            <Rect
              x={x}
              y={y}
              width={barW}
              height={barH}
              fill={`url(#${gradId})`}
              rx={4}
              ry={4}
            />
            {showValues && d.value > 0 && (
              <SvgText
                x={x + barW / 2}
                y={y - 4}
                textAnchor="middle"
                fontSize={9}
                fill="#a1a1aa"
              >
                {shortFmt(d.value)}
              </SvgText>
            )}
            <SvgText
              x={x + barW / 2}
              y={padT + chartH + 14}
              textAnchor="middle"
              fontSize={10}
              fill="#71717a"
            >
              {d.label}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

/**
 * SVG line chart with gradient area fill — used for monthly trend.
 * Dots at each data point; no axes (labels are handled by the caller).
 */
export function LineChart({
  data,
  height = 80,
  color = "#a78bfa",
  gradId = "lc_area",
  padding = 64,
}: {
  data: { value: number }[];
  height?: number;
  color?: string;
  gradId?: string;
  padding?: number;
}) {
  const { width } = useWindowDimensions();
  const svgW = Math.max(width - padding, 200);
  const padT = 8;
  const padB = 8;
  const padL = 8;
  const padR = 8;
  const chartH = height - padT - padB;
  const chartW = svgW - padL - padR;
  const n = data.length;
  if (n < 2) return null;

  const max = Math.max(...data.map((d) => d.value), 1);
  const pts = data.map((d, i) => ({
    x: padL + (i / (n - 1)) * chartW,
    y: padT + (1 - d.value / max) * chartH,
  }));

  const linePath = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath = [
    linePath,
    `L${pts[n - 1].x.toFixed(1)},${(padT + chartH).toFixed(1)}`,
    `L${pts[0].x.toFixed(1)},${(padT + chartH).toFixed(1)}`,
    "Z",
  ].join(" ");

  return (
    <Svg width={svgW} height={height}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <Stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </LinearGradient>
      </Defs>
      <Path d={areaPath} fill={`url(#${gradId})`} />
      <Path
        d={linePath}
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {pts.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={3} fill={color} />
      ))}
    </Svg>
  );
}
