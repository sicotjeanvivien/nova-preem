import { useI18n } from "../i18n/i18n.tsx";

// The "carte tirée" logo (canvas note "Logo", 2026-11-04; kit in docs/nova-preem-logo-kit/):
// a 3×3 binder page whose rare card, in coral, slides out of its pocket at an angle.
// The coral is reserved for the logo: the interface accent does not change.

/** Filled (1) and empty (0) pockets, row by row; the top-right pocket is the one the rare card leaves. */
const POCKETS = [
  [0, 1, 0],
  [1, 1, 0],
  [1, 0, 1],
];
const X = [6, 38, 70];
const Y = [4, 36, 68];
const PULLED = "translate(5 -7) rotate(14 82 18)";

const classes = (base: string, extra: string) => (extra ? `${base} ${extra}` : base);

/**
 * The symbol. Decorative: the name next to it carries the meaning. The outline around
 * the rare card takes the colour of the background (`--logo-gap`, page background by default).
 */
export function LogoSymbol({ className = "" }: { className?: string }) {
  return (
    <svg className={classes("logo-symbol", className)} viewBox="-2 -8 108 108" aria-hidden="true" focusable="false">
      {POCKETS.flatMap((row, r) =>
        row.map((filled, c) => (
          <rect
            key={`${r}-${c}`}
            className={filled ? "logo-symbol__filled" : "logo-symbol__empty"}
            x={X[c]}
            y={Y[r]}
            width={24}
            height={28}
            rx={3}
          />
        )),
      )}
      <rect className="logo-symbol__gap" x={70} y={4} width={24} height={28} rx={3} strokeWidth={7} transform={PULLED} />
      <rect className="logo-symbol__card" x={70} y={4} width={24} height={28} rx={3} transform={PULLED} />
    </svg>
  );
}

/**
 * The name, in Oxanium: the first word bold, the second one lighter and grey, set
 * together. Screen readers get the name as a whole, with its space.
 */
export function LogoName({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const name = t("app.name");
  const [first, ...rest] = name.split(" ");
  return (
    <span className={classes("logo-name", className)}>
      <span aria-hidden="true">
        <span className="logo-name__first">{first}</span>
        <span className="logo-name__rest">{rest.join(" ")}</span>
      </span>
      <span className="visually-hidden">{name}</span>
    </span>
  );
}
