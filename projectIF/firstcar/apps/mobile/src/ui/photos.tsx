/**
 * Real photos from Wikimedia Commons (no AI images), bundled at 900–1000 px: front, rear and interior per demo model,
 * one photo per claim topic (timing belt, rust, winter tyres…), and a Lapland road for Home. The licences need the authors named; Settings → Photo credits lists them all.
 */
import { DEMO_ADS, type CarSpec, type ClaimType, type ItemOrigin, type MandatoryCheckId } from '@firstcar/core';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Radius, Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import type { Translate } from '@/i18n';
import { EASE, ENTER, PressableScale, tick } from '@/ui/motion';
import { Txt } from '@/ui/primitives';

type Model = 'golf6' | 'golf7' | 'corolla' | 'octavia' | 'passat' | 'focus';
type Angle = 'front' | 'rear' | 'interior';
type CarLike = Partial<Pick<CarSpec, 'make' | 'model' | 'modelYear'>>;

export interface Credit {
  what: string;
  author: string;
  license: string;
}

const MODEL_NAME: Record<Model, string> = {
  golf6: 'Volkswagen Golf VI',
  golf7: 'Volkswagen Golf VII',
  corolla: 'Toyota Corolla',
  octavia: 'Škoda Octavia Combi',
  passat: 'Volkswagen Passat',
  focus: 'Ford Focus',
};

// Metro needs literal require paths, so every file is listed.
const SOURCES: Record<Model, Record<Angle, ImageSourcePropType>> = {
  golf6: {
    front: require('@/../assets/images/photos/golf6-front.jpg'),
    rear: require('@/../assets/images/photos/golf6-rear.jpg'),
    interior: require('@/../assets/images/photos/golf6-interior.jpg'),
  },
  golf7: {
    front: require('@/../assets/images/photos/golf7-front.jpg'),
    rear: require('@/../assets/images/photos/golf7-rear.jpg'),
    interior: require('@/../assets/images/photos/golf7-interior.jpg'),
  },
  corolla: {
    front: require('@/../assets/images/photos/corolla-front.jpg'),
    rear: require('@/../assets/images/photos/corolla-rear.jpg'),
    interior: require('@/../assets/images/photos/corolla-interior.jpg'),
  },
  octavia: {
    front: require('@/../assets/images/photos/octavia-front.jpg'),
    rear: require('@/../assets/images/photos/octavia-rear.jpg'),
    interior: require('@/../assets/images/photos/octavia-interior.jpg'),
  },
  passat: {
    front: require('@/../assets/images/photos/passat-front.jpg'),
    rear: require('@/../assets/images/photos/passat-rear.jpg'),
    interior: require('@/../assets/images/photos/passat-interior.jpg'),
  },
  focus: {
    front: require('@/../assets/images/photos/focus-front.jpg'),
    rear: require('@/../assets/images/photos/focus-rear.jpg'),
    interior: require('@/../assets/images/photos/focus-interior.jpg'),
  },
};

const AUTHORS: Record<Model, Record<Angle, [author: string, license: string]>> = {
  golf6: { front: ['Thomas doerfer', 'CC BY 3.0'], rear: ['Thomas doerfer', 'CC BY 3.0'], interior: ['TTTNIS', 'Public domain'] },
  golf7: { front: ['Vauxford', 'CC BY-SA 4.0'], rear: ['Vauxford', 'CC BY-SA 4.0'], interior: ['Antoineets', 'CC BY-SA 4.0'] },
  corolla: { front: ['KGC626', 'CC BY-SA 4.0'], rear: ['Alex Neman', 'CC BY-SA 4.0'], interior: ['TTTNIS', 'CC0'] },
  octavia: { front: ['Vauxford', 'CC BY-SA 4.0'], rear: ['Vauxford', 'CC BY-SA 4.0'], interior: ['Kickaffe (Mario von Berg)', 'CC BY-SA 3.0'] },
  passat: { front: ['Vauxford', 'CC BY-SA 4.0'], rear: ['Vauxford', 'CC BY-SA 4.0'], interior: ['Acgskup', 'CC BY 4.0'] },
  focus: { front: ['Vauxford', 'CC BY-SA 4.0'], rear: ['Vauxford', 'CC BY-SA 4.0'], interior: ['Kickaffe (Mario von Berg)', 'CC BY-SA 3.0'] },
};

const REPAIR = { source: require('@/../assets/images/photos/claim-repair.jpg'), author: 'Shixart1985', license: 'CC BY 2.0', what: 'Car repair' };

/** What a claim is about. Mileage uses the ad model's own dashboard instead (see claimPhoto). */
const TOPIC_PHOTOS: Partial<Record<ClaimType | MandatoryCheckId, { source: ImageSourcePropType; author: string; license: string; what: string }>> = {
  service_history: { source: require('@/../assets/images/photos/claim-service.jpg'), author: 'Andrew Napier', license: 'CC BY 2.0', what: 'Oil change' },
  timing_belt: { source: require('@/../assets/images/photos/claim-timing-belt.jpg'), author: 'Mofardo.designoli', license: 'CC BY-SA 4.0', what: 'Timing belt' },
  clutch: { source: require('@/../assets/images/photos/claim-clutch.jpg'), author: 'dave_7', license: 'CC BY-SA 2.0', what: 'Clutch kit' },
  recent_repair: REPAIR,
  known_defects: REPAIR,
  inspection_valid: { source: require('@/../assets/images/photos/claim-inspection.jpg'), author: 'PtG', license: 'CC BY-SA 4.0', what: 'A-Katsastus inspection station' },
  no_rust: { source: require('@/../assets/images/photos/claim-rust.jpg'), author: 'Ildar Sagdejev (Specious)', license: 'CC BY-SA 4.0', what: 'Rust on a wheel arch' },
  no_accidents: { source: require('@/../assets/images/photos/claim-accident.jpg'), author: 'Matti Blume', license: 'CC BY-SA 3.0', what: 'Crash damage' },
  tyres_included: { source: require('@/../assets/images/photos/claim-tyres.jpg'), author: 'Ilya Plekhanov', license: 'CC BY-SA 3.0', what: 'Studded winter tyre' },
  keys_count: { source: require('@/../assets/images/photos/claim-keys.jpg'), author: 'Adder3824', license: 'CC BY-SA 4.0', what: 'Car key' },
};

const HERO_PHOTO: ImageSourcePropType = require('@/../assets/images/photos/hero-lapland.jpg');
const ANGLES: Angle[] = ['front', 'rear', 'interior'];

/** Every photo with its author and licence, for Settings → Photo credits. */
export function photoCredits(t: Translate): Credit[] {
  const cars = (Object.keys(MODEL_NAME) as Model[]).flatMap((m) =>
    ANGLES.map((a) => ({ what: `${MODEL_NAME[m]}, ${t(`photo.${a}`)}`, author: AUTHORS[m][a][0], license: AUTHORS[m][a][1] })),
  );
  const topics = [...new Set(Object.values(TOPIC_PHOTOS))].map((x) => ({ what: x!.what, author: x!.author, license: x!.license }));
  return [{ what: t('photo.heroName'), author: 'Ximonic (Simo Räsänen)', license: 'CC BY-SA 4.0' }, ...cars, ...topics];
}

function modelOf(car: CarLike): Model | undefined {
  const make = car.make?.toLowerCase() ?? '';
  const model = car.model?.toLowerCase() ?? '';
  const vw = make === 'vw' || make === 'volkswagen';
  if (vw && model.startsWith('golf')) return car.modelYear !== undefined && car.modelYear <= 2012 ? 'golf6' : 'golf7';
  if (vw && model.startsWith('passat')) return 'passat';
  if (make === 'toyota' && model.startsWith('corolla')) return 'corolla';
  if ((make === 'skoda' || make === 'škoda') && model.startsWith('octavia')) return 'octavia';
  if (make === 'ford' && model.startsWith('focus')) return 'focus';
  return undefined;
}

/** The front photo of the ad's model (and Golf generation), or undefined when we have none. */
export function carFront(car: CarLike): ImageSourcePropType | undefined {
  const m = modelOf(car);
  return m ? SOURCES[m].front : undefined;
}

/** The photo for a claim or check: its topic, or for mileage the dashboard of the ad's model. */
export function claimPhoto(key: ClaimType | MandatoryCheckId, car: CarLike): ImageSourcePropType | undefined {
  if (key === 'odometer') {
    const m = modelOf(car);
    return m ? SOURCES[m].interior : undefined;
  }
  return TOPIC_PHOTOS[key]?.source;
}

export function itemPhoto(origin: ItemOrigin, car: CarLike): ImageSourcePropType | undefined {
  if (origin.kind === 'claim') return claimPhoto(origin.claimType, car);
  if (origin.kind === 'mandatory') return claimPhoto(origin.checkId, car);
  return undefined;
}

/** A wide photo for one claim, fading in, tagged as an example: a rusty arch here is not the seller's car. */
export function ClaimPhoto({ source, t, aspectRatio = 16 / 9 }: { source: ImageSourcePropType; t: Translate; aspectRatio?: number }) {
  const p = usePalette();
  return (
    <Animated.View entering={ENTER}>
      <Image source={source} style={[styles.claimImage, { aspectRatio, backgroundColor: p.surfaceAlt }]} contentFit="cover" transition={150} accessible={false} />
      <ExampleTag t={t} />
    </Animated.View>
  );
}

/** The photos show the model, not the seller's car: a small tag on the photo says so. */
function ExampleTag({ t }: { t: Translate }) {
  return (
    <View style={styles.tag} pointerEvents="none">
      <Txt variant="caption" color="#FFFFFF">
        {t('photo.exampleTag')}
      </Txt>
    </View>
  );
}

/** Swipeable front / rear / interior photos of the ad's model, with dots underneath. */
export function CarGallery({ car, t }: { car: CarLike; t: Translate }) {
  const p = usePalette();
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const m = modelOf(car);
  if (!m) return null;
  return (
    <View style={styles.gallery} accessible accessibilityLabel={t('photo.galleryLabel', { model: MODEL_NAME[m] })}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => width && setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          style={styles.galleryScroll}>
          {ANGLES.map((a) => (
            <Image key={a} source={SOURCES[m][a]} style={[styles.slide, { width: width || 1, backgroundColor: p.surfaceAlt }]} contentFit="cover" transition={150} />
          ))}
        </ScrollView>
        <ExampleTag t={t} />
      </View>
      <View style={styles.dots}>
        {ANGLES.map((a, i) => (
          <Dot key={a} active={i === index} />
        ))}
      </View>
    </View>
  );
}

/** Gallery position dot: the current one stretches into a pill. */
function Dot({ active }: { active: boolean }) {
  const p = usePalette();
  const w = useSharedValue(active ? 20 : 7);
  useEffect(() => {
    w.set(withTiming(active ? 20 : 7, EASE));
  }, [active, w]);
  const style = useAnimatedStyle(() => ({ width: w.get() }));
  return <Animated.View style={[styles.dot, style, { backgroundColor: active ? p.primary : p.borderStrong }]} />;
}

/** Big photo at the top of Home. */
export function HeroPhoto({ t }: { t: Translate }) {
  const p = usePalette();
  return <Image source={HERO_PHOTO} style={[styles.hero, { backgroundColor: p.surfaceAlt }]} contentFit="cover" accessibilityLabel={t('photo.heroAlt')} accessible />;
}

/** Small rounded thumbnail for list rows; `small` is a square for rows that also carry badges. */
export function PhotoThumb({ source, small }: { source: ImageSourcePropType; small?: boolean }) {
  const p = usePalette();
  return <Image source={source} style={[small ? styles.thumbSmall : styles.thumb, { backgroundColor: p.surfaceAlt }]} contentFit="cover" accessible={false} />;
}

/** One photo card per demo ad. `row` scrolls sideways (Home); `grid` wraps two per row (new case). */
export function DemoAdCards({ t, selected, onPick, layout }: { t: Translate; selected?: string; onPick: (id: string) => void; layout: 'row' | 'grid' }) {
  const p = usePalette();
  const cards = DEMO_ADS.map((ad) => {
    const front = carFront(ad.llm.car);
    const on = ad.id === selected;
    const [name, note] = ad.label.split(' (');
    return (
      <PressableScale
        key={ad.id}
        scaleTo={0.96}
        accessibilityRole={layout === 'grid' ? 'radio' : 'button'}
        accessibilityState={layout === 'grid' ? { checked: on } : undefined}
        accessibilityLabel={ad.label}
        onPress={() => {
          tick();
          onPick(ad.id);
        }}
        containerStyle={layout === 'row' ? styles.cardRow : styles.cardGrid}
        style={[styles.card, { backgroundColor: on ? p.primarySoft : p.surface, borderColor: on ? p.primary : p.border }]}>
        {front ? <Image source={front} style={[styles.cardImage, { backgroundColor: p.surfaceAlt }]} contentFit="cover" /> : null}
        <View style={styles.cardText}>
          <Txt variant="bodyStrong" numberOfLines={1} color={on ? p.primary : undefined}>
            {name}
          </Txt>
          {note ? (
            <Txt variant="caption" numberOfLines={2}>
              {note.replace(/\)$/, '')}
            </Txt>
          ) : null}
        </View>
      </PressableScale>
    );
  });
  if (layout === 'grid') return <View style={styles.grid}>{cards}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityLabel={t('home.demoTitle')}>
      {cards}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  gallery: { gap: Spacing.sm },
  galleryScroll: { borderRadius: Radius.lg },
  slide: { aspectRatio: 16 / 10 },
  tag: { position: 'absolute', top: Spacing.sm, left: Spacing.sm, backgroundColor: '#24150CB3', borderRadius: Radius.pill, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.xs },
  dot: { height: 7, borderRadius: 4 },
  hero: { width: '100%', aspectRatio: 3 / 2, borderRadius: Radius.lg },
  thumb: { width: 72, height: 54, borderRadius: Radius.md },
  thumbSmall: { width: 48, height: 48, borderRadius: Radius.md },
  claimImage: { width: '100%', borderRadius: Radius.lg },
  row: { gap: Spacing.md, paddingRight: Spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  card: { borderWidth: 1.5, borderRadius: Radius.lg, overflow: 'hidden' },
  cardRow: { width: 200 },
  cardGrid: { flexBasis: '45%', flexGrow: 1 },
  cardImage: { width: '100%', aspectRatio: 16 / 10 },
  cardText: { padding: Spacing.md, gap: 2 },
});
