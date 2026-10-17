import { DEMO_ADS, MAX_AD_CHARS, createCase } from '@firstcar/core';
import * as Clipboard from 'expo-clipboard';
import { randomUUID } from 'expo-crypto';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { extractClaims } from '@/adapters';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useSession } from '@/state/session';
import { useStore } from '@/state/store';
import { notify } from '@/ui/dialog';
import { IconLine } from '@/ui/icon';
import { Button, Choice, Screen, Section, Txt } from '@/ui/primitives';

export default function NewCase() {
  const { t, prefs } = useSession();
  const { data, addCase } = useStore();
  const p = usePalette();
  const [text, setText] = useState('');
  const [demoId, setDemoId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const paste = async () => {
    try {
      setText((await Clipboard.getStringAsync()).slice(0, MAX_AD_CHARS));
      setDemoId(undefined);
    } catch (e) {
      notify(t('common.error', { error: e instanceof Error ? e.message : String(e) }));
    }
  };

  const pickDemo = (id: string) => {
    setDemoId(id);
    setText(DEMO_ADS.find((a) => a.id === id)?.text ?? '');
  };

  const analyse = async () => {
    if (!text.trim()) {
      setError(t('new.empty'));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const now = new Date();
      const ad = await extractClaims(text, { useMockLlm: data.llmMock, inputKind: demoId ? 'demo_fixture' : 'pasted_text', now });
      const c = createCase(randomUUID(), ad, now);
      addCase(c);
      router.replace({ pathname: '/cases/[id]/claims', params: { id: c.id } });
    } catch (e) {
      setError(t('common.error', { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button label={t('new.analyse')} onPress={analyse} loading={busy} disabled={!text.trim()} />}>
      <Stack.Screen options={{ title: t('new.title') }} />
      <Txt>{t('new.body')}</Txt>
      <Button kind="secondary" label={t('new.paste')} onPress={paste} />
      <TextInput
        value={text}
        onChangeText={(v) => {
          setText(v);
          setDemoId(undefined);
        }}
        placeholder={t('new.placeholder')}
        placeholderTextColor={p.textSecondary}
        multiline
        maxLength={MAX_AD_CHARS}
        accessibilityLabel={t('new.placeholder')}
        style={[styles.input, { color: p.text, borderColor: p.borderStrong, backgroundColor: p.surface }]}
      />
      {error ? (
        <Txt color={p.danger} accessibilityLiveRegion="polite">
          {error}
        </Txt>
      ) : null}
      <IconLine icon="lock" variant="caption">{t('new.redactNote')}</IconLine>
      <Section title={t('new.demo')}>
        <Choice label={t('new.demo')} value={demoId} onChange={pickDemo} options={DEMO_ADS.map((a) => ({ value: a.id, label: a.label[prefs.locale] }))} />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { fontFamily: Fonts.regular, minHeight: 200, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: 15, lineHeight: 22, textAlignVertical: 'top' },
});
