import { StyleSheet, View } from 'react-native';
import { AppButton } from '../../../shared/components/AppButton';
import { NoticeBanner } from '../../../shared/components/NoticeBanner';
import { spacing } from '../../../shared/theme';
import { useLanguage } from '../../../app/providers/LanguageContext';

export function StartConflictPrompt({
  currentRoutineName,
  onContinue,
  onReplace,
  onCancel,
  busy = false,
}: {
  currentRoutineName: string;
  onContinue: () => void;
  onReplace: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const { t } = useLanguage();

  return (
    <View testID="start-conflict-prompt">
      <NoticeBanner
        tone="warning"
        title={t('conflict.title')}
        message={t('conflict.message', { name: currentRoutineName })}
      />
      <AppButton
        label={t('conflict.continue')}
        onPress={onContinue}
        disabled={busy}
        testID="conflict-continue"
      />
      <AppButton
        label={t('conflict.replace')}
        variant="danger"
        onPress={onReplace}
        disabled={busy}
        testID="conflict-replace"
        style={styles.gap}
      />
      <AppButton
        label={t('common.cancel')}
        variant="secondary"
        onPress={onCancel}
        disabled={busy}
        testID="conflict-cancel"
        style={styles.gap}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  gap: {
    marginTop: spacing.sm,
  },
});
