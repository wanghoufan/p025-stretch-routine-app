import { StyleSheet, Text, View } from 'react-native';
import type { RoutineSummary } from '../../../domain/routine/Routine';
import { formatDuration } from '../../../shared/utils/format';
import { colors, radius, spacing } from '../../../shared/theme';
import { AppButton } from '../../../shared/components/AppButton';
import { ActionIconTile } from '../../../shared/components/ActionIconTile';
import { sceneIconFor } from '../../../shared/assets/actionIcons';
import { useLanguage } from '../../../app/providers/LanguageContext';

export function RoutineCard({
  summary,
  hasActiveSession,
  onOpen,
  onStart,
  badge,
  scene,
}: {
  summary: RoutineSummary;
  hasActiveSession: boolean;
  onOpen: () => void;
  onStart: () => void;
  badge?: string;
  scene?: string;
}) {
  const { t } = useLanguage();
  const meta = t('detail.stepCount', { count: summary.stepCount, duration: formatDuration(summary.totalDurationSec) });

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <ActionIconTile source={sceneIconFor(scene ?? '')} size={64} />
        <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text style={styles.name} maxFontSizeMultiplier={1.5} accessibilityRole="header">
            {summary.name}
          </Text>
          {badge ? (
            <Text
              style={styles.badge}
              maxFontSizeMultiplier={1.4}
              testID={`routine-badge-${summary.id}`}
              accessibilityLabel={`${t('detail.difficulty')} ${badge}`}
            >
              {badge}
            </Text>
          ) : null}
        </View>
        <Text style={styles.meta} maxFontSizeMultiplier={1.5}>
          {meta}
        </Text>
        {hasActiveSession ? (
          <Text style={styles.resumeHint} maxFontSizeMultiplier={1.5}>
            {t('routine.resumeHint')}
          </Text>
        ) : null}
        </View>
      </View>
      <View style={styles.actions}>
        <AppButton
          label={hasActiveSession ? t('common.continue') : t('common.start')}
          onPress={onStart}
          accessibilityHint={hasActiveSession ? t('routine.resumeHint') : t('routine.startHint')}
          testID={`routine-start-${summary.id}`}
        />
        <AppButton
          label={t('routine.detail')}
          variant="secondary"
          onPress={onOpen}
          accessibilityHint={t('routine.openHint')}
          testID={`routine-open-${summary.id}`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  info: {
    flex: 1,
    marginBottom: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  meta: {
    marginTop: spacing.xs,
    fontSize: 14,
    color: colors.textMuted,
  },
  resumeHint: {
    marginTop: spacing.xs,
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
