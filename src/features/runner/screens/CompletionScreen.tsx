import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '../../../app/navigation/NavigationContext';
import { useServices } from '../../../app/providers/ServicesContext';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { formatStatsDuration } from '../../stats/statsFormat';
import { AppButton } from '../../../shared/components/AppButton';
import { Card } from '../../../shared/components/Layout';
import { Screen } from '../../../shared/components/Screen';
import { ActionIconTile } from '../../../shared/components/ActionIconTile';
import { actionIconFor } from '../../../shared/assets/actionIcons';
import { isActive } from '../../../domain/session/RunnerState';
import {
  deviceTimezoneOffsetMin,
  type CompletionOutcome,
} from '../../../domain/statistics/history';
import { colors, fontSizes, spacing } from '../../../shared/theme';

/**
 * Completion screen (T045, SPEC US1 scenario 5).
 *
 * TASK-021-B4 (HD-6/HD-7): the duration shown here is the session's actual
 * action time — the exact `statsTotalStepMs` ledger the archive stores, so
 * this screen and the statistics screen always agree on source, unit and
 * rounding. The archive outcome decides the honest status line:
 * counted / neutral exclusion / retryable failure / unrecoverable loss.
 */
export function CompletionScreen() {
  const params = useRoute('Completion');
  const navigation = useNavigation();
  const services = useServices();
  const { language, t } = useLanguage();
  const [outcome, setOutcome] = useState<CompletionOutcome>(params.outcome);
  const [retrying, setRetrying] = useState(false);

  /**
   * Retry entry for a failed archive. This is the only retry surface for both
   * a failed COMPLETED archive and (since the B4 rework) a failed early-stop
   * one. The failed transaction kept the terminal
   * session row; `archiveAndClear` is idempotent by `session_id`, so a retry
   * can never double-count. Anything else found in the row (cleared or live
   * again) is no longer archivable here and is reported as an uncounted loss.
   */
  const retryArchive = useCallback(() => {
    void (async () => {
      setRetrying(true);
      try {
        const load = await services.sessions.loadActive();
        if (load.status === 'ok' && !isActive(load.session.state)) {
          const endWallMs = services.wallClock.nowMs();
          const result = await services.history.archiveAndClear(load.session, {
            endWallMs,
            endTimezoneOffsetMin: deviceTimezoneOffsetMin(endWallMs),
          });
          setOutcome(
            result.kind === 'archived'
              ? { status: 'archived' }
              : result.kind === 'excluded'
                ? { status: 'excluded', reason: result.reason }
                : result.kind === 'wall-date-untrusted'
                  ? { status: 'wall-date-untrusted' }
                  : { status: 'failed' },
          );
        } else {
          setOutcome({ status: 'wall-date-untrusted' });
        }
      } catch {
        setOutcome({ status: 'failed' });
      } finally {
        setRetrying(false);
      }
    })();
  }, [services]);

  const duration = formatStatsDuration(params.actionMs, language);

  return (
    <Screen title={t('nav.done')} scroll={false}>
      <Card style={styles.card}>
        <ActionIconTile source={actionIconFor(params.routineName)} size={88} style={styles.heroTile} />
        <Text style={styles.title} maxFontSizeMultiplier={1.4} accessibilityRole="header">
          {t('runner.completed')}
        </Text>
        <Text style={styles.name} maxFontSizeMultiplier={1.5} testID="completion-routine-name">
          {params.routineName}
        </Text>
        <Text style={styles.meta} maxFontSizeMultiplier={1.5} testID="completion-summary">
          {t('completion.summary', { count: params.stepCount, duration })}
        </Text>
        {/* HD-6: the number shrank for existing users — explain the caliber. */}
        <Text style={styles.note} maxFontSizeMultiplier={1.5} testID="completion-action-time-note">
          {t('completion.actionTimeNote')}
        </Text>
        {outcome.status === 'archived' ? (
          <Text style={styles.counted} maxFontSizeMultiplier={1.5} testID="completion-counted">
            {t('completion.counted')}
          </Text>
        ) : null}
        {outcome.status === 'excluded' ? (
          // Expected exclusion (pre-upgrade / 0ms / ERROR): neutral local note,
          // never the anomaly caveat (V1.3 §3).
          <Text style={styles.note} maxFontSizeMultiplier={1.5} testID="completion-exclusion">
            {t(`stats.exclusion.${outcome.reason}`)}
          </Text>
        ) : null}
      </Card>

      {outcome.status === 'failed' ? (
        <View style={styles.retryArea} testID="completion-retry-area">
          <Text style={styles.retryNote} maxFontSizeMultiplier={1.5}>
            {t('completion.notCountedRetry')}
          </Text>
          <AppButton
            label={t('common.retry')}
            variant="secondary"
            onPress={retryArchive}
            disabled={retrying}
            testID="completion-retry"
          />
        </View>
      ) : null}
      {outcome.status === 'wall-date-untrusted' ? (
        <Text style={[styles.retryNote, styles.lostNote]} maxFontSizeMultiplier={1.5} testID="completion-not-counted">
          {t('completion.notCounted')}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <AppButton
          label={t('nav.done')}
          onPress={() => navigation.reset('Home', undefined)}
          testID="completion-done"
          accessibilityHint={t('completion.doneHint')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginTop: spacing.lg,
  },
  heroTile: {
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSizes.title,
    fontWeight: '800',
    color: colors.success,
  },
  name: {
    marginTop: spacing.md,
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  meta: {
    marginTop: spacing.sm,
    fontSize: fontSizes.meta,
    color: colors.textMuted,
    textAlign: 'center',
  },
  note: {
    marginTop: spacing.sm,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: spacing.lg,
  },
  counted: {
    marginTop: spacing.sm,
    fontSize: fontSizes.body,
    fontWeight: '700',
    color: colors.success,
  },
  retryArea: {
    marginTop: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  retryNote: {
    fontSize: fontSizes.body,
    color: colors.warningText,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.lg,
  },
  lostNote: {
    marginTop: spacing.lg,
  },
  actions: {
    marginTop: spacing.lg,
  },
});
