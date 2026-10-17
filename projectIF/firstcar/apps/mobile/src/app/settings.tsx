import { Stack, router } from 'expo-router';
import { Alert, Share } from 'react-native';

import { useSession } from '@/state/session';
import { useStore } from '@/state/store';
import { Button, Card, Choice, Screen, Section, Txt } from '@/ui/primitives';

export default function Settings() {
  const { t, prefs, setPrefs, availability, wipeEverything } = useSession();
  const { data, patch, saveError } = useStore();

  const onOff = [
    { value: true, label: t('common.yes') },
    { value: false, label: t('common.no') },
  ];

  const exportData = () => Share.share({ message: JSON.stringify(data, null, 2) });

  const confirmWipe = () =>
    Alert.alert(t('settings.deleteAll'), t('settings.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.deleteAll'),
        style: 'destructive',
        onPress: async () => {
          await wipeEverything();
          router.replace('/');
        },
      },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('settings.title') }} />
      <Section title={t('settings.language')}>
        <Choice
          label={t('settings.language')}
          value={prefs.locale}
          onChange={(locale) => setPrefs({ ...prefs, locale })}
          options={[
            { value: 'en', label: 'English' },
            { value: 'fi', label: 'Suomi' },
          ]}
        />
      </Section>

      <Section title={t('settings.lock')}>
        {availability === 'none' ? (
          <Txt variant="small">{t('settings.lockUnavailable')}</Txt>
        ) : (
          <>
            <Choice label={t('settings.lock')} value={prefs.biometricLock} onChange={(biometricLock) => setPrefs({ ...prefs, biometricLock })} options={onOff} />
            <Txt variant="caption">{t('settings.lockHint')}</Txt>
          </>
        )}
      </Section>

      <Section title={t('settings.demo')}>
        <Txt variant="small">{t('settings.llmMock')}</Txt>
        <Choice label={t('settings.llmMock')} value={data.llmMock} onChange={(llmMock) => patch({ llmMock })} options={onOff} />
        <Txt variant="small">{t('settings.skipLock')}</Txt>
        <Choice label={t('settings.skipLock')} value={prefs.skipLockInDemo} onChange={(skipLockInDemo) => setPrefs({ ...prefs, skipLockInDemo })} options={onOff} />
      </Section>

      <Section title={t('settings.privacyTitle')}>
        <Card>
          <Txt>{t('settings.privacyBody')}</Txt>
        </Card>
        {saveError ? <Txt variant="small">{t('common.error', { error: saveError })}</Txt> : null}
        <Button kind="secondary" label={t('settings.export')} onPress={exportData} />
        <Button kind="danger" label={t('settings.deleteAll')} onPress={confirmWipe} />
      </Section>
    </Screen>
  );
}
