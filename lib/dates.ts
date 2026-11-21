/** Pure calendar helpers on "YYYY-MM-DD" strings (no server timezone involved). */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(v: string | null | undefined): v is string {
    return !!v && ISO.test(v);
}

/** YYYY-MM-DD for `date` in `timeZone` (invalid zones fall back to UTC). */
export function dayIn(timeZone: string, date: Date = new Date()): string {
    let tz = timeZone || 'UTC';
    try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); } catch { tz = 'UTC'; }
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Calendar arithmetic, UTC-safe (no DST/server-zone drift). */
export function addDays(day: string, delta: number): string {
    const [y, m, d] = day.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + delta);
    return dt.toISOString().slice(0, 10);
}
