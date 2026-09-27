import { StyleSheet, Text, View } from 'react-native';
import type { ActiveSessionSummary } from '../../routines/hooks/useRoutines';
import { AppButton } from '../../../shared/components/AppButton';
import { Card } from '../../../shared/components/Layout';
import { colors, fontSizes, spacing } from '../../../shared/theme';
import { useLanguage } from '../../../app/providers/LanguageContext';

export function ActiveSessionBanner({
  session,
  onContinue,
  busy = false,
}: {
  session: ActiveSessionSummary;
  onContinue: () => void;
  busy?: boolean;
}) {
  const { t } = useLanguage();

  return (
    <View testID="home-active-session-banner">
      <Card style={styles.card}>
        <Text style={styles.label} maxFontSizeMultiplier={1.5}>
          {t('home.sessionActive')}
        </Text>
        <Text
          style={styles.name}
          maxFontSizeMultiplier={1.5}
          accessibilityRole="header"
          testID="home-active-session-name"
        >
          {session.routineName}
        </Text>
        <Text style={styles.meta} maxFontSizeMultiplier={1.5}>
          {t('session.stepCount', { count: session.stepCount })}
        </Text>
        <AppButton
          label={t('session.continue')}
          onPress={onContinue}
          disabled={busy}
          testID="home-continue-session"
          accessibilityHint={t('session.continue')}
          style={styles.action}
        />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderColor: colors.primary,
  },
  label: {
    fontSize: fontSizes.meta,
    fontWeight: '700',
    color: colors.primary,
  },
  name: {
    marginTop: spacing.xs,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  meta: {
    marginTop: spacing.xs,
    fontSize: fontSizes.meta,
    color: colors.textMuted,
  },
  action: {
    marginTop: spacing.md,
  },
});
