/** Device-local reminders (§6.4): no push server, no cost. */
import type { Reminder } from '@firstcar/core';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type ScheduleResult = 'scheduled' | 'denied' | 'unsupported';

export async function scheduleReminders(reminders: Reminder[], now: Date): Promise<ScheduleResult> {
  if (Platform.OS === 'web') return 'unsupported';
  const perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return 'denied';

  await Notifications.cancelAllScheduledNotificationsAsync();
  const upcoming = reminders.filter((r) => new Date(r.dueAt) > now);
  await Promise.all(
    upcoming.map((r) =>
      Notifications.scheduleNotificationAsync({
        content: { title: r.title },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(r.dueAt) },
      }),
    ),
  );
  return 'scheduled';
}
