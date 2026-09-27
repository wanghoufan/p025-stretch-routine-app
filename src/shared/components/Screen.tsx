import type { ReactNode } from 'react';
import { Platform, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { colors, fontSizes, MIN_TOUCH_SIZE, spacing } from '../theme';
import { AppButton } from './AppButton';
import { useLanguage } from '../../app/providers/LanguageContext';

const TOP_INSET = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;

export function Screen({
  title,
  onBack,
  children,
  scroll = true,
  headerRight,
}: {
  title: string;
  onBack?: () => void;
  children: ReactNode;
  scroll?: boolean;
  headerRight?: ReactNode;
}) {
  const { t } = useLanguage();

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        {onBack ? (
          <AppButton
            label={t('common.back')}
            variant="secondary"
            onPress={onBack}
            accessibilityHint={t('common.back')}
            style={styles.backButton}
          />
        ) : null}
        <Text style={styles.title} numberOfLines={1} maxFontSizeMultiplier={1.4} accessibilityRole="header">
          {title}
        </Text>
        <View style={styles.headerRight}>{headerRight}</View>
      </View>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.contentFlex}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: TOP_INSET,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  backButton: {
    minHeight: MIN_TOUCH_SIZE,
    paddingHorizontal: spacing.md,
  },
  title: {
    flex: 1,
    fontSize: fontSizes.title,
    fontWeight: '700',
    color: colors.text,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  contentFlex: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
});
