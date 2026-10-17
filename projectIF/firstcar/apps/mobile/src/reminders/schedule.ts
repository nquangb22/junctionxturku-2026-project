/** Device-local reminders (§6.4): no push server, no cost. */
import type { Reminder } from '@firstcar/core';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type ScheduleResult = 'scheduled' | 'denied' | 'unsupported';

/** Marks notifications as ours, so rescheduling never cancels anything else. */
const TAG = 'firstcarReminder';

// Runs are serialised: overlapping cancel + schedule passes would leave duplicates.
let queue: Promise<unknown> = Promise.resolve();

export function scheduleReminders(reminders: Reminder[], now: Date): Promise<ScheduleResult> {
  const run = queue.then(() => schedule(reminders, now));
  queue = run.catch(() => undefined);
  return run;
}

async function schedule(reminders: Reminder[], now: Date): Promise<ScheduleResult> {
  if (Platform.OS === 'web') return 'unsupported';
  const perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return 'denied';

  const existing = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(existing.filter((n) => n.content.data?.[TAG] === true).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  const upcoming = reminders.filter((r) => new Date(r.dueAt) > now);
  await Promise.all(
    upcoming.map((r) =>
      Notifications.scheduleNotificationAsync({
        content: { title: r.title, data: { [TAG]: true, reminderId: r.id } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(r.dueAt) },
      }),
    ),
  );
  return 'scheduled';
}
