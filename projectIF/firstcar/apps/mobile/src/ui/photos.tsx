/**
 * Real photos from Wikimedia Commons (no AI images), bundled at 1000 px. CC BY / CC BY-SA need the author and licence
 * shown next to the photo and a link to the original: PhotoCredit and the Settings credits list do both.
 */
import type { CarSpec } from '@firstcar/core';
import { Image } from 'expo-image';
import { openBrowserAsync } from 'expo-web-browser';
import { Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import type { Translate } from '@/i18n';
import { Txt } from '@/ui/primitives';

export type PhotoKey = 'hero' | 'golf6' | 'golf7' | 'corolla' | 'octavia' | 'passat' | 'focus';

export interface Photo {
  source: ImageSourcePropType;
  /** Model name shown in "Example photo of a …"; the hero has none. */
  model?: string;
  author: string;
  license: string;
  page: string;
}

export const PHOTOS: Record<PhotoKey, Photo> = {
  hero: {
    source: require('@/../assets/images/photos/hero-lapland.jpg'),
    author: 'Ximonic (Simo Räsänen)',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Cars_parked_on_the_sides_of_road_during_high_autumn_season,_Muonio,_Lapland,_Finland,_2021_September.jpg',
  },
  golf6: {
    source: require('@/../assets/images/photos/golf-6.jpg'),
    model: 'Volkswagen Golf VI',
    author: 'Thomas doerfer',
    license: 'CC BY 3.0',
    page: 'https://commons.wikimedia.org/wiki/File:VW_Golf_VI_1.6_Comfortline_Deep_Black.JPG',
  },
  golf7: {
    source: require('@/../assets/images/photos/golf-7.jpg'),
    model: 'Volkswagen Golf VII',
    author: 'Vauxford',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:2013_Volkswagen_Golf_SE_BlueMotion_Technology_1.4_Front.jpg',
  },
  corolla: {
    source: require('@/../assets/images/photos/corolla.jpg'),
    model: 'Toyota Corolla',
    author: 'KGC626',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:2018_Toyota_Corolla_1.6_Valvematic_Multidrive_S_Luna.jpg',
  },
  octavia: {
    source: require('@/../assets/images/photos/octavia.jpg'),
    model: 'Škoda Octavia Combi',
    author: 'Vauxford',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:2016_Skoda_Octavia_SE_L_TSi_Estate_1.4_Front.jpg',
  },
  passat: {
    source: require('@/../assets/images/photos/passat.jpg'),
    model: 'Volkswagen Passat',
    author: 'Vauxford',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:2017_Volkswagen_Passat_GT_TDi_2.0_Front.jpg',
  },
  focus: {
    source: require('@/../assets/images/photos/focus.jpg'),
    model: 'Ford Focus',
    author: 'Vauxford',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:2015_Ford_Focus_Titanium_1.0_Front.jpg',
  },
};

/** An example photo of the same model (and Golf generation) as the ad, or undefined when we have none. */
export function carPhoto(car: Partial<Pick<CarSpec, 'make' | 'model' | 'modelYear'>>): Photo | undefined {
  const make = car.make?.toLowerCase() ?? '';
  const model = car.model?.toLowerCase() ?? '';
  const vw = make === 'vw' || make === 'volkswagen';
  if (vw && model.startsWith('golf')) return PHOTOS[car.modelYear !== undefined && car.modelYear <= 2012 ? 'golf6' : 'golf7'];
  if (vw && model.startsWith('passat')) return PHOTOS.passat;
  if (make === 'toyota' && model.startsWith('corolla')) return PHOTOS.corolla;
  if ((make === 'skoda' || make === 'škoda') && model.startsWith('octavia')) return PHOTOS.octavia;
  if (make === 'ford' && model.startsWith('focus')) return PHOTOS.focus;
  return undefined;
}

/** "Photo: author, licence": opens the original on Wikimedia Commons, as the licences ask. */
export function PhotoCredit({ photo, t }: { photo: Photo; t: Translate }) {
  return (
    <Pressable accessibilityRole="link" hitSlop={6} onPress={() => void openBrowserAsync(photo.page)}>
      <Txt variant="caption" style={styles.link}>
        {t('photo.credit', { author: photo.author, license: photo.license })}
      </Txt>
    </Pressable>
  );
}

/**
 * A wide photo with its credit. For a car it says plainly that this is an example of the model,
 * not the car in the ad: a buyer must never mistake it for the seller's photo.
 */
export function PhotoCard({ photo, t, alt, aspectRatio = 16 / 9 }: { photo: Photo; t: Translate; alt?: string; aspectRatio?: number }) {
  const p = usePalette();
  const label = alt ?? (photo.model ? t('photo.example', { model: photo.model }) : undefined);
  return (
    <View style={styles.wrap}>
      <Image
        source={photo.source}
        style={[styles.image, { aspectRatio, backgroundColor: p.surfaceAlt }]}
        contentFit="cover"
        transition={150}
        accessibilityLabel={label}
        accessible={!!label}
      />
      <View style={styles.caption}>
        {photo.model ? <Txt variant="caption">{t('photo.example', { model: photo.model })}</Txt> : null}
        <PhotoCredit photo={photo} t={t} />
      </View>
    </View>
  );
}

/** Small rounded thumbnail for list rows; the credit sits in Settings → Photo credits. */
export function PhotoThumb({ photo }: { photo: Photo }) {
  const p = usePalette();
  return <Image source={photo.source} style={[styles.thumb, { backgroundColor: p.surfaceAlt }]} contentFit="cover" accessible={false} />;
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.xs },
  image: { width: '100%', borderRadius: Radius.lg },
  caption: { gap: 2 },
  link: { textDecorationLine: 'underline' },
  thumb: { width: 72, height: 54, borderRadius: Radius.md },
});
