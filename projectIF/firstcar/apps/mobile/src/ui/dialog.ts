/** Cross-platform dialogs: Alert.alert is a no-op on web, so fall back to window.confirm / window.alert. */
import { Alert, Platform } from 'react-native';

export function confirmAction(opts: { title: string; message: string; confirmLabel: string; cancelLabel: string; destructive?: boolean; onConfirm: () => void }) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${opts.title}\n\n${opts.message}`)) opts.onConfirm();
    return;
  }
  Alert.alert(opts.title, opts.message, [
    { text: opts.cancelLabel, style: 'cancel' },
    { text: opts.confirmLabel, style: opts.destructive ? 'destructive' : 'default', onPress: opts.onConfirm },
  ]);
}

export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') globalThis.alert?.(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}
