import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { makeT } from '@/i18n';
import { useReminderSync } from '@/reminders/use-reminder-sync';
import { SessionProvider, useSession } from '@/state/session';
import { StoreProvider, useStoreState } from '@/state/store';
import { Button, Txt } from '@/ui/primitives';

SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** Render errors land here (expo-router). Outside the providers, so the language comes from the device. */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const p = usePalette();
  const t = makeT(Intl.DateTimeFormat().resolvedOptions().locale.startsWith('fi') ? 'fi' : 'en');
  return (
    <View style={[styles.errorRoot, { backgroundColor: p.background }]}>
      <Txt variant="title" accessibilityRole="header">
        {t('error.title')}
      </Txt>
      <Txt>{t('error.body')}</Txt>
      <Button label={t('error.retry')} onPress={retry} />
    </View>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <SafeAreaProvider>
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <SessionProvider>
          <StoreProvider>
            <AppStack />
          </StoreProvider>
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function AppStack() {
  const p = usePalette();
  useReminderSync();
  return (
    <View style={styles.fill}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: p.surface },
          headerTintColor: p.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: p.background },
        }}
      />
      <SaveErrorBanner />
    </View>
  );
}

/** A failed save means recent changes exist only in memory: say so on every screen. */
function SaveErrorBanner() {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { t } = useSession();
  const { saveError } = useStoreState();
  if (!saveError) return null;
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={[styles.banner, { backgroundColor: p.danger, paddingBottom: Spacing.sm + insets.bottom }]}>
      <Txt color={p.onPrimary} variant="bodyStrong">
        {t('common.saveFailed')}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  errorRoot: { flex: 1, justifyContent: 'center', gap: Spacing.lg, padding: Spacing.xl },
  banner: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
});
