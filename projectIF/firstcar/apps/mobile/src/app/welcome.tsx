import { Stack, router } from 'expo-router';
import { Platform } from 'react-native';

import { useSession } from '@/state/session';
import { useStore } from '@/state/store';
import { Button, Card, Choice, Screen, Txt } from '@/ui/primitives';

export default function Welcome() {
  const { t, prefs, setPrefs } = useSession();
  const { patch } = useStore();

  const start = () => {
    patch({ welcomed: true });
    router.replace('/');
  };

  return (
    <Screen footer={<Button label={t('welcome.cta')} onPress={start} />}>
      <Stack.Screen options={{ title: t('appName'), headerBackVisible: false }} />
      <Choice
        label={t('settings.language')}
        value={prefs.locale}
        onChange={(locale) => setPrefs({ ...prefs, locale })}
        options={[
          { value: 'en', label: 'English' },
          { value: 'fi', label: 'Suomi' },
        ]}
      />
      <Txt variant="title" accessibilityRole="header">
        {t('welcome.title')}
      </Txt>
      <Card>
        <Txt>🔒 {t(Platform.OS === 'web' ? 'welcome.p1Web' : 'welcome.p1')}</Txt>
      </Card>
      <Card>
        <Txt>🤖 {t('welcome.p2')}</Txt>
      </Card>
      <Card>
        <Txt>⚖️ {t('welcome.p3')}</Txt>
      </Card>
    </Screen>
  );
}
