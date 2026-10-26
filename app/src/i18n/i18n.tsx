import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { InterfaceLanguage } from "../domain/settings.ts";
import { MESSAGES, type MessageKey } from "./messages.ts";

export interface Translator {
  language: InterfaceLanguage;
  t(key: MessageKey, params?: Record<string, string | number>): string;
  /** Integer percentage, rounded down (spec §5.3). */
  percent(fraction: number): string;
  number(value: number): string;
}

function createTranslator(language: InterfaceLanguage): Translator {
  const messages = MESSAGES[language];
  const pluralRules = new Intl.PluralRules(language);
  const percentFormat = new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 0 });
  const numberFormat = new Intl.NumberFormat(language);
  return {
    language,
    t(key, params = {}) {
      const message = messages[key];
      return typeof message === "function" ? message(params, (n) => pluralRules.select(n)) : message;
    },
    percent: (fraction) => percentFormat.format(Math.floor(fraction * 100) / 100),
    number: (value) => numberFormat.format(value),
  };
}

const I18nContext = createContext<Translator>(createTranslator("fr"));

export function I18nProvider({ language, children }: { language: InterfaceLanguage; children: ReactNode }) {
  const translator = useMemo(() => createTranslator(language), [language]);
  return <I18nContext.Provider value={translator}>{children}</I18nContext.Provider>;
}

export function useI18n(): Translator {
  return useContext(I18nContext);
}
