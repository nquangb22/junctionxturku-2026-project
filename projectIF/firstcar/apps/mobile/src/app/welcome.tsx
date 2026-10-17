import { Stack, router } from 'expo-router';
import { Platform } from 'react-native';

import { useSession } from '@/state/session';
import { useStore } from '@/state/store';
import { IconLine } from '@/ui/icon';
import { Button, Card, Choice, Hero, Screen } from '@/ui/primitives';

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
      <Hero icon="shield" title={t('welcome.title')} />
      <Card>
        <IconLine icon="lock">{t(Platform.OS === 'web' ? 'welcome.p1Web' : 'welcome.p1')}</IconLine>
      </Card>
      <Card>
        <IconLine icon="sparkles">{t('welcome.p2')}</IconLine>
      </Card>
      <Card>
        <IconLine icon="scale">{t('welcome.p3')}</IconLine>
      </Card>
    </Screen>
  );
}
