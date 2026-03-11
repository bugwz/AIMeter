function trimTrailingZeros(value: string): string {
  return value.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function formatScaledDuration(value: number, singular: string, plural: string): string {
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) <= 0.02) {
    return `${rounded} ${rounded === 1 ? singular : plural}`;
  }
  const fractionDigits = value < 2 ? 2 : value < 10 ? 1 : 0;
  const scaled = trimTrailingZeros(value.toFixed(fractionDigits));
  return `${scaled} ${Number(scaled) === 1 ? singular : plural}`;
}

export function formatWindowDurationFromMinutes(windowMinutes?: number | null): string {
  if (!Number.isFinite(windowMinutes) || windowMinutes === null || windowMinutes === undefined || windowMinutes <= 0) {
    return '';
  }

  const minutes = Math.round(windowMinutes);
  const units: Array<{ minutes: number; singular: string; plural: string }> = [
    { minutes: 30 * 24 * 60, singular: 'month', plural: 'months' },
    { minutes: 7 * 24 * 60, singular: 'week', plural: 'weeks' },
    { minutes: 24 * 60, singular: 'day', plural: 'days' },
    { minutes: 60, singular: 'hour', plural: 'hours' },
    { minutes: 1, singular: 'minute', plural: 'minutes' },
  ];

  const matched = units.find((unit) => minutes >= unit.minutes) || units[units.length - 1];
  return formatScaledDuration(minutes / matched.minutes, matched.singular, matched.plural);
}
