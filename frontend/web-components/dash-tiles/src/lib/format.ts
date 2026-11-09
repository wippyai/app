import type { NumericCell } from './frame.ts'

/**
 * A number in the grouping of a locale (550135 shows as 550,135 in English). A decimal or a big integer
 * that travels as a string is formatted without a round trip through a float.
 */
export function formatNumber(value: NumericCell, locale?: string | string[]): string {
  return new Intl.NumberFormat(locale).format(value as number)
}

/** The locale of the viewer's browser. Undefined lets Intl choose its default. */
export function browserLocale(): string | undefined {
  return typeof navigator !== 'undefined' && navigator.language ? navigator.language : undefined
}
