import { StyleSheet, View } from 'react-native';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { AppButton } from '../../../shared/components/AppButton';
import { spacing } from '../../../shared/theme';

/**
 * Playback controls (T053, FR-021..FR-025).
 *
 * Every control updates authoritative runner state; none of them just nudges a
 * visual counter (Constitution X). All copy goes through the i18n dictionary
 * (TASK-021-B4, HD-7) so a language switch takes effect immediately.
 */
export function RunnerControls({
  isPaused,
  canGoPrevious,
  canAddTime,
  onPrevious,
  onTogglePause,
  onAddTime,
  onSkip,
  onEnd,
}: {
  isPaused: boolean;
  canGoPrevious: boolean;
  canAddTime: boolean;
  onPrevious: () => void;
  onTogglePause: () => void;
  onAddTime: () => void;
  onSkip: () => void;
  onEnd: () => void;
}) {
  const { t } = useLanguage();

  return (
    <View>
      <AppButton
        label={isPaused ? t('runner.resume') : t('runner.pause')}
        onPress={onTogglePause}
        testID="runner-pause"
        accessibilityHint={isPaused ? t('runner.hint.resume') : t('runner.hint.pause')}
        style={styles.primary}
      />
      <View style={styles.row}>
        <AppButton
          label={t('runner.previous')}
          variant="secondary"
          onPress={onPrevious}
          disabled={!canGoPrevious}
          testID="runner-previous"
          accessibilityHint={canGoPrevious ? t('runner.hint.previous') : t('runner.hint.firstStep')}
        />
        <AppButton
          label={t('runner.addTime')}
          variant="secondary"
          onPress={onAddTime}
          disabled={!canAddTime}
          testID="runner-add-time"
          accessibilityHint={t('runner.hint.addTime')}
        />
        <AppButton
          label={t('runner.skip')}
          variant="secondary"
          onPress={onSkip}
          testID="runner-skip"
          accessibilityHint={t('runner.hint.skip')}
        />
      </View>
      <AppButton
        label={t('runner.end')}
        variant="danger"
        onPress={onEnd}
        testID="runner-end"
        accessibilityHint={t('runner.hint.end')}
        style={styles.end}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  primary: {
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  end: {
    marginTop: spacing.sm,
  },
});
