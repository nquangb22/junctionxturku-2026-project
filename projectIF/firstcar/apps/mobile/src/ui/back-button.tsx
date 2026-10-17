/**
 * Header back button that works after a reload or deep link: with no history it goes to the
 * screen's logical parent instead of disappearing. Drawn with views, so there is no asset to fail.
 */
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { usePalette } from '@/hooks/use-palette';
import { useSession } from '@/state/session';

type Params = Record<string, string | string[] | undefined> | undefined;

/** Screens that never show a back button. */
export const ROOT_ROUTES = new Set(['index', 'welcome']);

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Where "back" goes when there is no history, keyed by expo-router route name. */
export function parentHref(routeName: string, params: Params): Href {
  const id = one(params?.id);
  if (routeName === 'ready/result') return '/ready';
  if (!id || routeName === 'cases/[id]/index') return '/';
  if (routeName === 'cases/[id]/item/[itemId]') return { pathname: '/cases/[id]/ledger', params: { id } };
  if (routeName.startsWith('cases/[id]/')) return { pathname: '/cases/[id]', params: { id } };
  return '/';
}

export function BackButton({ routeName, params }: { routeName: string; params: Params }) {
  const p = usePalette();
  const { t } = useSession();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(parentHref(routeName, params)));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={8} onPress={goBack} style={styles.button}>
      <View style={[styles.chevron, { borderColor: p.text }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minWidth: 44, minHeight: 44, justifyContent: 'center', paddingLeft: 6 },
  chevron: { width: 12, height: 12, borderLeftWidth: 2.5, borderBottomWidth: 2.5, transform: [{ rotate: '45deg' }] },
});
