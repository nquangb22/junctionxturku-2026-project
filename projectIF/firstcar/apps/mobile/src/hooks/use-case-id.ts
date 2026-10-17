import { useLocalSearchParams } from 'expo-router';

/** The `[id]` route param, normalised (expo-router may hand back string | string[]). */
export function useCaseId(): string | undefined {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  return Array.isArray(id) ? id[0] : id;
}
