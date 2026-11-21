/** Greeting by hour: morning 5–11:59, noon 12–13:59, afternoon 14–16:59, evening 17–20:59, night 21–4:59. */
export function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 14) return 'Good noon';
  if (hour >= 14 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night';
}

/** Hour (0–23) in Asia/Dhaka, the agency's home timezone. */
export function dhakaHour(date: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Dhaka' }).format(date)) % 24;
}
