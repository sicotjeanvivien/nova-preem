// Anomalies found while building the catalog. They never stop the pipeline:
// they are written to report.json so that the tables or the model can be fixed.

export type Severity = "warning" | "info";

export type AnomalyCode =
  | "unknown-edition"
  | "unused-edition"
  | "language-mismatch"
  | "unknown-rarity"
  | "unknown-card-type"
  | "unknown-color"
  | "unknown-legality"
  | "card-without-printings"
  | "malformed-collector-number"
  | "duplicate-printing-key"
  | "variant-card-conflict"
  | "missing-translation"
  | "variant-mismatch"
  | "missing-retail-counterpart"
  | "missing-beta-counterpart"
  | "counterpart-mismatch"
  | "missing-localized-name"
  | "divergent-localized-name"
  | "divergent-rules-text"
  | "unexpected-name-format"
  | "missing-rules-text"
  | "placeholder-artist"
  | "numbering-gap"
  | "missing-image"
  | "outdated-image";

export type AnomalyContext = Record<string, string | number | string[]>;

export interface Anomaly {
  code: AnomalyCode;
  severity: Severity;
  message: string;
  context: AnomalyContext;
}

export class Report {
  readonly #anomalies: Anomaly[] = [];

  warn(code: AnomalyCode, message: string, context: AnomalyContext = {}): void {
    this.#anomalies.push({ code, severity: "warning", message, context });
  }

  info(code: AnomalyCode, message: string, context: AnomalyContext = {}): void {
    this.#anomalies.push({ code, severity: "info", message, context });
  }

  /** Anomalies in a deterministic order: by code, then message. */
  get anomalies(): Anomaly[] {
    return [...this.#anomalies].sort((a, b) => compare(a.code, b.code) || compare(a.message, b.message));
  }

  byCode(code: AnomalyCode): Anomaly[] {
    return this.anomalies.filter((anomaly) => anomaly.code === code);
  }

  /** Number of anomalies per code, e.g. for the end-of-run summary. */
  summary(): { code: AnomalyCode; severity: Severity; count: number }[] {
    const counts = new Map<AnomalyCode, { severity: Severity; count: number }>();
    for (const { code, severity } of this.anomalies) {
      const entry = counts.get(code) ?? { severity, count: 0 };
      entry.count++;
      counts.set(code, entry);
    }
    return [...counts].map(([code, { severity, count }]) => ({ code, severity, count }));
  }
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
