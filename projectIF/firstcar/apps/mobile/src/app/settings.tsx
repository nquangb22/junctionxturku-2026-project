import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';

import { useSession } from '@/state/session';
import { useStore } from '@/state/store';
import { confirmAction, notify } from '@/ui/dialog';
import { Icon } from '@/ui/icon';
import { Badge, Button, Card, Choice, Screen, Section, Txt } from '@/ui/primitives';
import { METHOD_ICON, methodName } from '@/ui/unlock-method';
import type { BiometricKind, LockSupport } from '@/vault/lock';

export default function Settings() {
  const { t, prefs, setPrefs, availability, support, verifyUnlock, wipeEverything } = useSession();
  const [lockNote, setLockNote] = useState<{ ok: boolean; text: string } | undefined>();
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

  // Turning the lock on needs one successful unlock first, so nobody locks themselves out.
  const setLock = async (biometricLock: boolean) => {
    if (biometricLock && !(await verifyUnlock())) {
      setLockNote({ ok: false, text: t('settings.enableFailed') });
      return;
    }
    setLockNote(undefined);
    await setPrefs({ ...prefs, biometricLock });
  };

  const testUnlock = async () => {
    const ok = await verifyUnlock();
    setLockNote({ ok, text: t(ok ? 'settings.testOk' : 'settings.testFailed') });
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
            <Choice label={t('settings.lock')} value={prefs.biometricLock} onChange={(on) => void setLock(on)} options={onOff} />
            <Txt variant="caption">{t('settings.lockHint')}</Txt>
            <MethodList support={support} />
            {Constants.executionEnvironment === ExecutionEnvironment.StoreClient && Platform.OS === 'ios' && support.kinds.includes('face') ? (
              <Txt variant="caption">{t('settings.expoGoFaceId')}</Txt>
            ) : null}
            {lockNote ? <Badge tone={lockNote.ok ? 'success' : 'danger'} icon={lockNote.ok ? 'check' : 'warning'} label={lockNote.text} /> : null}
            <Button kind="secondary" label={t('settings.test')} onPress={() => void testUnlock()} />
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

/** Face ID and fingerprint (Touch ID on iPhone) always listed, so the buyer sees which one this phone uses; passcode last. */
function MethodList({ support }: { support: LockSupport }) {
  const { t } = useSession();
  const p = usePalette();
  const kinds: BiometricKind[] = ['face', 'fingerprint', ...(support.kinds.includes('iris') ? (['iris'] as const) : [])];
  const status = (k: BiometricKind) => (!support.kinds.includes(k) ? 'methodUnsupported' : support.enrolled ? 'methodReady' : 'methodNotEnrolled');
  return (
    <Card>
      <Txt variant="bodyStrong">{t('settings.methods')}</Txt>
      {kinds.map((k) => {
        const s = status(k);
        return (
          <View key={k} style={styles.method} accessible accessibilityLabel={`${methodName(k, t)}: ${t(`settings.${s}`)}`}>
            <Icon name={METHOD_ICON[k]} size={26} color={s === 'methodReady' ? p.primary : p.textSecondary} />
            <View style={styles.methodText}>
              <Txt variant="bodyStrong" color={s === 'methodUnsupported' ? p.textSecondary : undefined}>
                {methodName(k, t)}
              </Txt>
              <Txt variant="caption">{t(`settings.${s}`)}</Txt>
            </View>
            {s === 'methodReady' ? <Icon name="check" size={22} color={p.success} /> : null}
          </View>
        );
      })}
      <View style={styles.method} accessible accessibilityLabel={`${methodName('passcode', t)}: ${t('settings.methodFallback')}`}>
        <Icon name={METHOD_ICON.passcode} size={26} color={p.textSecondary} />
        <View style={styles.methodText}>
          <Txt variant="bodyStrong">{methodName('passcode', t)}</Txt>
          <Txt variant="caption">{t('settings.methodFallback')}</Txt>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  method: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xs },
  methodText: { flex: 1 },
});
