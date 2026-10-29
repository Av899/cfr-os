// lib/venue-theme.ts: CFR OS venue theme logic
// Dark from 18:00 (6 PM) to 05:59 (6 AM) venue time

import { useEffect, useState } from 'react';

/** Returns 'dark' from 18:00 to 05:59, 'light' otherwise */
export function venueTheme(now = new Date(), timeZone = 'Asia/Kolkata'): 'dark' | 'light' {
  try {
    const hour = Number(
      new Intl.DateTimeFormat('en-IN', {
        hour: 'numeric',
        hourCycle: 'h23',
        timeZone,
      }).format(now),
    );
    return hour >= 18 || hour < 6 ? 'dark' : 'light';
  } catch {
    const hour = now.getHours();
    return hour >= 18 || hour < 6 ? 'dark' : 'light';
  }
}

/** Hook that checks the venue theme every minute and returns the resolved theme */
export function useVenueTheme(timeZone = 'Asia/Kolkata'): 'dark' | 'light' {
  const [resolved, setResolved] = useState<'dark' | 'light'>(() => venueTheme(new Date(), timeZone));

  useEffect(() => {
    const check = () => {
      setResolved(venueTheme(new Date(), timeZone));
    };

    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, [timeZone]);

  return resolved;
}
