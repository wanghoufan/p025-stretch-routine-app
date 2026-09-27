import { useEffect, useRef } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { useSpeech } from '../../../app/providers/SpeechContext';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { formatClock } from '../../../shared/utils/format';
import { Card } from '../../../shared/components/Layout';
import { NoticeBanner } from '../../../shared/components/NoticeBanner';
import { Screen } from '../../../shared/components/Screen';
import { ActionIconTile } from '../../../shared/components/ActionIconTile';
import { actionIconFor } from '../../../shared/assets/actionIcons';
import { colors, fontSizes, radius, spacing } from '../../../shared/theme';
import { formatStatsDuration } from '../../stats/statsFormat';
import { RunnerControls } from '../components/RunnerControls';
import { useRunner } from '../hooks/useRunner';

/**
 * Runner screen (T041).
 *
 * Renders the authoritative session; the visible countdown is only a
 * presentation of timestamp-derived state (Constitution §3.3).
 *
 * TASK-021-B4: fully bilingual (HD-7); navigation to the completion screen is
 * gated on the terminal-archive outcome so success is never reported before
 * the commit (V1.3 DoD); the elapsed line keeps its transition-inclusive
 * source but says so explicitly (HD-6). A successful early stop still goes
 * straight home; only a failed one enters the completion screen for its
 * retry entry (review P1-2).
 */
export function RunnerScreen() {
  const navigation = useNavigation();
  const { ttsError, dismissTtsError } = useSpeech();
  const { language, t } = useLanguage();
  const { view, togglePause, addTime, previous, skip, end } = useRunner({});

  const navigatedRef = useRef<'idle' | 'completed' | 'stopped'>('idle');

  useEffect(() => {
    if (navigatedRef.current !== 'idle') {
      return;
    }
    if (view.isFinished && view.routineName) {
      // Wait for the archive commit to settle; 'failed' still navigates —
      // the completion screen owns the retry entry.
      if (!view.terminalOutcome || view.terminalOutcome.status === 'pending') {
        return;
      }
      navigatedRef.current = 'completed';
      navigation.replace('Completion', {
        routineId: view.routineId ?? '',
        routineName: view.routineName,
        stepCount: view.stepCount,
        actionMs: view.statsActionMs,
        outcome: view.terminalOutcome,
      });
      return;
    }
    if (view.isStopped) {
      // TASK-021-B4 rework (review P1-2): an early stop also waits for its
      // archive outcome before navigating. Success (archived, or a deliberate
      // expected exclusion) goes straight home exactly as before; only a
      // failure that left the session uncounted (or an untrusted end date)
      // routes to the completion screen, which owns the retry entry.
      if (!view.terminalOutcome || view.terminalOutcome.status === 'pending') {
        return;
      }
      navigatedRef.current = 'stopped';
      if (
        view.terminalOutcome.status === 'archived' ||
        view.terminalOutcome.status === 'excluded'
      ) {
        navigation.reset('Home', undefined);
        return;
      }
      navigation.replace('Completion', {
        routineId: view.routineId ?? '',
        routineName: view.routineName ?? '',
        stepCount: view.stepCount,
        actionMs: view.statsActionMs,
        outcome: view.terminalOutcome,
      });
    }
  }, [
    view.isFinished,
    view.isStopped,
    view.routineId,
    view.routineName,
    view.stepCount,
    view.statsActionMs,
    view.terminalOutcome,
    navigation,
  ]);

  const confirmEnd = () => {
    // Fact fix (V1.3 DoD): an early end DOES count when action time exists,
    // so the old "completed parts are not saved" claim is gone; nothing is
    // promised for a 0ms session either.
    Alert.alert(t('runner.endConfirmTitle'), t('runner.endConfirmMessage'), [
      { text: t('runner.endConfirmResume'), style: 'cancel' },
      { text: t('runner.endConfirmStop'), style: 'destructive', onPress: end },
    ]);
  };

  if (view.status === 'loading') {
    return (
      <Screen title={t('runner.screenTitle')} scroll={false}>
        <Text style={styles.meta} maxFontSizeMultiplier={1.5}>
          {t('common.loading')}
        </Text>
      </Screen>
    );
  }

  if (view.status !== 'ready') {
    return (
      <Screen title={t('runner.screenTitle')} onBack={navigation.goBack}>
        <NoticeBanner
          tone="error"
          title={t('runner.cannotResume')}
          message={view.errorMessage ?? t('runner.noActive')}
          actionLabel={t('common.back')}
          onAction={() => navigation.reset('Home', undefined)}
        />
      </Screen>
    );
  }

  const isTransition = view.isTransition;
  const headline = isTransition ? t('runner.transitionHeadline') : (view.currentStep?.displayName ?? '');
  const speakPreview = isTransition ? view.transitionTarget?.speakText : view.currentStep?.speakText;

  return (
    <Screen title={view.routineName ?? t('runner.screenTitle')} onBack={confirmEnd} scroll={false}>
      {ttsError ? (
        <NoticeBanner
          tone="warning"
          title={t('runner.ttsWarning')}
          message={t('runner.ttsWarningDesc', { error: ttsError })}
          actionLabel={t('common.gotIt')}
          onAction={dismissTtsError}
        />
      ) : null}

      <Card style={styles.card}>
        <ActionIconTile source={actionIconFor(headline)} size={96} style={styles.heroTile} />
        <Text style={styles.position} maxFontSizeMultiplier={1.5}>
          {t('runner.position', { index: view.stepPosition, count: view.stepCount })}
        </Text>
        <Text
          style={styles.headline}
          maxFontSizeMultiplier={1.4}
          accessibilityRole="header"
          testID="runner-current-step"
        >
          {headline}
        </Text>
        <Text
          style={styles.countdown}
          maxFontSizeMultiplier={1.4}
          testID="runner-remaining"
          accessibilityLabel={`${t('runner.remaining')} ${formatClock(view.remainingMs)}`}
        >
          {formatClock(view.remainingMs)}
        </Text>
        <Text style={styles.meta} maxFontSizeMultiplier={1.5} testID="runner-phase">
          {isTransition
            ? t('runner.transitionTo', { name: view.transitionTarget?.displayName ?? '' })
            : t('runner.stepDuration', {
                duration: formatStatsDuration(
                  Math.round(view.currentStep?.durationSec ?? 0) * 1000,
                  language,
                ),
              })}
        </Text>
        {view.isPaused ? (
          <Text style={styles.paused} maxFontSizeMultiplier={1.5} testID="runner-paused">
            {t('runner.paused')}
          </Text>
        ) : null}

        <View
          style={styles.progressTrack}
          accessibilityRole="progressbar"
          accessibilityLabel={t('runner.progressLabel')}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(view.progress * 100) }}
        >
          <View style={[styles.progressFill, { width: `${Math.round(view.progress * 100)}%` }]} />
        </View>
        <Text style={styles.meta} maxFontSizeMultiplier={1.5}>
          {t('runner.elapsedTotal', {
            elapsed: formatClock(view.elapsedMs),
            total: formatStatsDuration(view.totalMs, language),
          })}
        </Text>
      </Card>

      {view.nextStep && !isTransition ? (
        <Text style={styles.next} maxFontSizeMultiplier={1.5} testID="runner-next-step">
          {t('runner.nextStep', { name: view.nextStep.displayName })}
        </Text>
      ) : null}

      {speakPreview ? (
        <Text style={styles.speak} maxFontSizeMultiplier={1.5}>
          {t('runner.speakPreview', { text: speakPreview })}
        </Text>
      ) : null}

      <RunnerControls
        isPaused={view.isPaused}
        canGoPrevious={view.canGoPrevious}
        canAddTime={view.canAddTime}
        onPrevious={previous}
        onTogglePause={togglePause}
        onAddTime={addTime}
        onSkip={skip}
        onEnd={confirmEnd}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginTop: spacing.sm,
  },
  heroTile: {
    marginBottom: spacing.md,
  },
  position: {
    fontSize: fontSizes.meta,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  headline: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  countdown: {
    fontSize: fontSizes.display,
    fontWeight: '800',
    color: colors.primary,
    marginVertical: spacing.sm,
    fontVariant: ['tabular-nums'],
  },
  meta: {
    fontSize: fontSizes.meta,
    color: colors.textMuted,
    textAlign: 'center',
  },
  paused: {
    marginTop: spacing.sm,
    fontSize: fontSizes.body,
    fontWeight: '700',
    color: colors.warningText,
  },
  progressTrack: {
    width: '100%',
    height: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    overflow: 'hidden',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  next: {
    marginTop: spacing.md,
    fontSize: fontSizes.body,
    color: colors.text,
  },
  speak: {
    marginTop: spacing.sm,
    fontSize: fontSizes.meta,
    color: colors.textMuted,
  },
});
