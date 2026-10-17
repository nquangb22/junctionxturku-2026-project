import { remindersFor } from '@firstcar/core';
import { useEffect } from 'react';

import { scheduleReminders } from '@/reminders/schedule';
import { useSession } from '@/state/session';
import { useStoreState } from '@/state/store';

/** While reminders are on, keeps the scheduled notifications in step with the owned cars. */
export function useReminderSync() {
  const { prefs } = useSession();
  const { data } = useStoreState();
  useEffect(() => {
    if (!data.remindersOn) return;
    const now = new Date();
    const owned = data.cases.filter((c) => c.status === 'owned' || c.status === 'registered');
    scheduleReminders(
      owned.flatMap((c) => remindersFor(c, now, prefs.locale)),
      now,
    ).catch(() => undefined);
  }, [data.remindersOn, data.cases, prefs.locale]);
}
