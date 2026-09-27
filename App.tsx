import { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { AppProviders } from './src/app/providers/AppProviders';
import { createAppServices, initializeApp } from './src/app/providers/createAppServices';
import { NavigationProvider } from './src/app/navigation/NavigationContext';
import { AppNavigator } from './src/app/navigation/AppNavigator';
import { colors, fontSizes, spacing } from './src/shared/theme';

/**
 * Hold the native launch screen (dark navy + brand mark) until boot finished.
 *
 * Module scope on purpose: Android auto-hides the splash as soon as the first
 * frame is drawn, so this has to register before that can happen. `hideAsync` is
 * called from the effect below — which is what keeps launch free of any blank,
 * white or black frame.
 */
void SplashScreen.preventAutoHideAsync();

/** Brand launch mark — the very same file the native splash uses (app.json plugin). */
const BRAND_ICON = require('./assets/motion-core-icon.png') as number;
/** Must match `plugins.expo-splash-screen.imageWidth` in app.json, both in dp. */
const BRAND_ICON_SIZE = 100;

/**
 * App entry: open the local database, apply migrations, seed the starter
 * library on a brand-new install, then render the stack.
 *
 * Boot never blocks on the network — V1 is local-only and offline by default
 * (Constitution II).
 */
export default function App() {
  const [services] = useState(() => createAppServices());
  const [boot, setBoot] = useState<{ status: 'loading' | 'ready' | 'error'; message?: string }>({
    status: 'loading',
  });

  useEffect(() => {
    let cancelled = false;
    initializeApp(services)
      .then(() => {
        if (!cancelled) {
          setBoot({ status: 'ready' });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setBoot({
            status: 'error',
            message: error instanceof Error ? error.message : '本地数据库初始化失败',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [services]);

  // Boot is over (ready, or failed before it could open a database): the skin below
  // is committed, so releasing the native splash can no longer expose a blank frame.
  // The error path must release it too, otherwise a failed boot would hide the
  // reason behind a splash screen forever.
  useEffect(() => {
    if (boot.status === 'loading') {
      return;
    }
    const frame = requestAnimationFrame(() => {
      void SplashScreen.hideAsync();
    });
    return () => cancelAnimationFrame(frame);
  }, [boot.status]);

  if (boot.status !== 'ready') {
    return <BootScreen error={boot.status === 'error' ? boot.message : undefined} />;
  }

  return (
    <AppProviders services={services}>
      <StatusBar style="dark" />
      <NavigationProvider>
        <AppNavigator />
      </NavigationProvider>
    </AppProviders>
  );
}

/**
 * Launch loading screen. Deliberately the same skin as the native splash
 * (#041B3D + the brand mark at the same size and position) so the hand-off from
 * the native splash to JS is invisible; it stays on screen behind the splash
 * until boot finishes, and remains as the loading/error view if the splash is
 * not available (Expo Go, web, tests).
 */
function BootScreen({ error }: { error?: string }) {
  const pulse = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (error) {
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [error, pulse]);

  return (
    <View style={styles.boot}>
      <StatusBar style="light" />
      <Image source={BRAND_ICON} style={styles.brandIcon} resizeMode="contain" />
      <View style={styles.brandFooter}>
        <Text style={styles.brandName} maxFontSizeMultiplier={1.5}>
          Motion Core 拉伸
        </Text>
        {error ? (
          <Text style={styles.bootError} maxFontSizeMultiplier={1.5}>
            {`本地数据库初始化失败：${error}`}
          </Text>
        ) : (
          <>
            <Animated.View style={[styles.pulse, { opacity: pulse }]} />
            <Text style={styles.bootText} maxFontSizeMultiplier={1.5}>
              正在准备本地数据…
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  // Sized in dp to line up with the native splash icon (app.json imageWidth).
  brandIcon: {
    width: BRAND_ICON_SIZE,
    height: BRAND_ICON_SIZE,
  },
  // Anchored below the centred mark so the mark itself stays at screen centre,
  // exactly where the native splash draws it.
  brandFooter: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    marginTop: BRAND_ICON_SIZE / 2 + spacing.xxl,
    alignItems: 'center',
  },
  brandName: {
    fontSize: fontSizes.title,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: colors.text,
  },
  pulse: {
    width: 56,
    height: 4,
    marginTop: spacing.lg,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  bootText: {
    marginTop: spacing.sm,
    fontSize: fontSizes.meta,
    color: colors.textMuted,
    textAlign: 'center',
  },
  bootError: {
    marginTop: spacing.lg,
    fontSize: fontSizes.body,
    color: colors.danger,
    textAlign: 'center',
  },
});
