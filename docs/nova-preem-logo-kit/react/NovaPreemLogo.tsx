// Logo Nova Preem — symbole « carte tirée » + nom (Oxanium 800 / 500).
// Charger Oxanium : <link href="https://fonts.googleapis.com/css2?family=Oxanium:wght@500;800&display=swap" rel="stylesheet">
type Props = { size?: number; theme?: "dark" | "light"; withName?: boolean };

const ACCENT = "#FF4D3D";
const THEMES = {
  dark: { fill: "#EDEAE3", empty: "#3A3C46", gap: "#0E0F14", sub: "#9A9AA3" },
  light: { fill: "#0E0F14", empty: "#C9C6BC", gap: "#F2F0EA", sub: "#55565E" },
};
// 1 = case remplie, 0 = case vide (la case en haut à droite est celle d'où sort la carte rare)
const GRID = [[0, 1, 0], [1, 1, 0], [1, 0, 1]];
const X = [6, 38, 70], Y = [4, 36, 68];
const PULLED = "translate(5 -7) rotate(14 82 18)";

export function NovaPreemSymbol({ size = 32, theme = "dark" }: Omit<Props, "withName">) {
  const t = THEMES[theme];
  return (
    <svg width={size} height={size} viewBox="-2 -8 108 108" role="img" aria-label="Nova Preem">
      {GRID.flatMap((row, r) =>
        row.map((on, c) => (
          <rect key={`${r}-${c}`} x={X[c]} y={Y[r]} width={24} height={28} rx={3} fill={on ? t.fill : t.empty} />
        )),
      )}
      <rect x={70} y={4} width={24} height={28} rx={3} fill={t.gap} stroke={t.gap} strokeWidth={7} transform={PULLED} />
      <rect x={70} y={4} width={24} height={28} rx={3} fill={ACCENT} transform={PULLED} />
    </svg>
  );
}

export function NovaPreemLogo({ size = 32, theme = "dark", withName = true }: Props) {
  const t = THEMES[theme];
  if (!withName) return <NovaPreemSymbol size={size} theme={theme} />;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: size * 0.3 }}>
      <NovaPreemSymbol size={size} theme={theme} />
      <span style={{ fontFamily: "Oxanium, sans-serif", fontSize: size * 0.62, letterSpacing: "0.04em", lineHeight: 1 }}>
        <span style={{ fontWeight: 800, color: t.fill }}>NOVA</span>
        <span style={{ fontWeight: 500, color: t.sub }}>PREEM</span>
      </span>
    </span>
  );
}
