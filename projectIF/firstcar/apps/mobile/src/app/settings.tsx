import { Stack, router } from 'expo-router';
import { Platform, Share, View } from 'react-native';

import { useSession } from '@/state/session';
import { useStore } from '@/state/store';
import { confirmAction, notify } from '@/ui/dialog';
import { PhotoCredit, PHOTOS } from '@/ui/photos';
import { Button, Card, Choice, Screen, Section, Txt } from '@/ui/primitives';

export default function Settings() {
  const { t, prefs, setPrefs, availability, wipeEverything } = useSession();
  const { data, patch, saveError } = useStore();

  const onOff = [
    { value: true, label: t('common.yes') },
    { value: false, label: t('common.no') },
  ];

  const exportData = async () => {
    try {
      await Share.share({ message: JSON.stringify(data, null, 2) });
    } catch (e) {
      notify(t('common.error', { error: e instanceof Error ? e.message : String(e) }));
    }
  };

  const confirmWipe = () =>
    confirmAction({
      title: t('settings.deleteAll'),
      message: t('settings.deleteConfirm'),
      confirmLabel: t('settings.deleteAll'),
      cancelLabel: t('common.cancel'),
      destructive: true,
      onConfirm: () => {
        // Leave this screen while the navigator is still mounted: the wipe unmounts the whole app tree.
        router.replace('/');
        void wipeEverything();
      },
    });

  return (
    <Screen>
      <Stack.Screen options={{ title: t('settings.title') }} />
      <Section title={t('settings.language')}>
        <Choice
          label={t('settings.language')}
          value={prefs.locale}
          onChange={(locale) => void setPrefs({ ...prefs, locale })}
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
            <Choice label={t('settings.lock')} value={prefs.biometricLock} onChange={(biometricLock) => void setPrefs({ ...prefs, biometricLock })} options={onOff} />
            <Txt variant="caption">{t('settings.lockHint')}</Txt>
          </>
        )}
      </Section>

      <Section title={t('settings.privacyTitle')}>
        <Card>
          <Txt>{t('settings.privacyBody')}</Txt>
        </Card>
        {Platform.OS === 'web' ? <Txt variant="small">{t('settings.webNote')}</Txt> : null}
        {saveError ? <Txt variant="small">{t('common.error', { error: saveError })}</Txt> : null}
        <Button kind="secondary" label={t('settings.export')} onPress={() => void exportData()} />
        <Button kind="danger" label={t('settings.deleteAll')} onPress={confirmWipe} />
      </Section>
      <Section title={t('settings.credits')}>
        <Txt variant="caption">{t('settings.creditsHint')}</Txt>
        <Card>
          {Object.values(PHOTOS).map((ph) => (
            <View key={ph.page} style={{ gap: 2 }}>
              <Txt variant="small">{ph.model ?? t('photo.heroName')}</Txt>
              <PhotoCredit photo={ph} t={t} />
            </View>
          ))}
        </Card>
      </Section>

      <Section title={t('settings.demo')}>
        <Txt variant="caption">{t('settings.demoHint')}</Txt>
        <Txt variant="small">{t('settings.llmMock')}</Txt>
        <Txt variant="caption">{t('settings.llmMockHint')}</Txt>
        <Choice label={t('settings.llmMock')} value={data.llmMock} onChange={(llmMock) => patch({ llmMock })} options={onOff} />
        {__DEV__ ? (
          <>
            <Txt variant="small">{t('settings.skipLock')}</Txt>
            <Txt variant="caption">{t('settings.skipLockHint')}</Txt>
            <Choice label={t('settings.skipLock')} value={prefs.skipLockInDemo} onChange={(skipLockInDemo) => void setPrefs({ ...prefs, skipLockInDemo })} options={onOff} />
          </>
        ) : null}
      </Section>

    </Screen>
  );
}
