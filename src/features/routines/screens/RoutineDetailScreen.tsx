import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import type { RoutineWithSteps } from '../../../data/repositories/routineRepository';
import { useNavigation, useRoute } from '../../../app/navigation/NavigationContext';
import { useServices } from '../../../app/providers/ServicesContext';
import { useSettings } from '../../../app/providers/SettingsContext';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { useSpeech } from '../../../app/providers/SpeechContext';
import { totalDurationSec } from '../../../domain/routine/duration';
import { formatDuration } from '../../../shared/utils/format';
import { AppButton } from '../../../shared/components/AppButton';
import { Card, SectionTitle } from '../../../shared/components/Layout';
import { NoticeBanner } from '../../../shared/components/NoticeBanner';
import { Screen } from '../../../shared/components/Screen';
import { ActionIconTile } from '../../../shared/components/ActionIconTile';
import { actionIconFor } from '../../../shared/assets/actionIcons';
import { colors, spacing } from '../../../shared/theme';
import { buildDeleteRoutineMessage, deleteRoutine } from '../services/deleteRoutine';
import { duplicateRoutine } from '../services/duplicateRoutine';
import { StartConflictPrompt } from '../../runner/components/StartConflictPrompt';
import { useStartRoutine } from '../../runner/hooks/useStartRoutine';

export function RoutineDetailScreen() {
  const { routineId } = useRoute('RoutineDetail');
  const services = useServices();
  const navigation = useNavigation();
  const { tts } = useSpeech();
  const { settings } = useSettings();
  const { t } = useLanguage();

  const [loaded, setLoaded] = useState<RoutineWithSteps | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const openRunner = useCallback(() => navigation.navigate('Runner', undefined), [navigation]);
  const startFlow = useStartRoutine(services, tts, settings, openRunner);

  const refresh = useCallback(async () => {
    try {
      const result = await services.routines.getWithSteps(routineId);
      setLoaded(result);
      setError(result ? null : t('detail.notFound'));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('detail.readError'));
    }
  }, [services, routineId, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDuplicate = useCallback(async () => {
    setBusy(true);
    try {
      await duplicateRoutine(services.routines, routineId, { generateId: services.generateId });
      navigation.reset('Home', undefined);
    } catch (duplicateError) {
      setError(duplicateError instanceof Error ? duplicateError.message : t('detail.duplicateError'));
    } finally {
      setBusy(false);
    }
  }, [services, routineId, navigation, t]);

  const confirmDelete = useCallback(() => {
    if (!loaded) {
      return;
    }
    Alert.alert(
      t('detail.deleteConfirm'),
      t('detail.deleteMessage', { name: loaded.routine.name, count: loaded.steps.length }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteRoutine(services.routines, routineId);
                navigation.reset('Home', undefined);
              } catch (deleteError) {
                setError(deleteError instanceof Error ? deleteError.message : t('detail.deleteError'));
              }
            })();
          },
        },
      ],
      { cancelable: true },
    );
  }, [loaded, services, routineId, navigation, t]);

  if (error) {
    return (
      <Screen title={t('detail.title')} onBack={navigation.goBack}>
        <NoticeBanner tone="error" title={t('detail.openError')} message={error} />
      </Screen>
    );
  }

  if (!loaded) {
    return (
      <Screen title={t('detail.title')} onBack={navigation.goBack}>
        <Text style={styles.meta} maxFontSizeMultiplier={1.5}>
          {t('common.loading')}
        </Text>
      </Screen>
    );
  }

  const total = totalDurationSec(loaded.steps);

  return (
    <Screen title={t('detail.title')} onBack={navigation.goBack}>
      <Card>
        <View style={styles.heroRow}>
          <ActionIconTile source={actionIconFor(loaded.routine.name)} size={72} />
          <View style={styles.heroInfo}>
            <Text style={styles.name} maxFontSizeMultiplier={1.5} accessibilityRole="header">
              {loaded.routine.name}
            </Text>
            <Text style={styles.meta} maxFontSizeMultiplier={1.5}>
              {t('detail.stepCount', { count: loaded.steps.length, duration: formatDuration(total) })}
            </Text>
          </View>
        </View>
      </Card>

      <AppButton
        label={t('detail.start')}
        onPress={() => {
          void startFlow.start(routineId);
        }}
        testID="detail-start"
      />

      {startFlow.state.status === 'error' ? (
        <NoticeBanner
          tone="error"
          title={t('home.startError')}
          message={startFlow.state.message}
          actionLabel={t('common.gotIt')}
          onAction={startFlow.dismissError}
        />
      ) : null}

      {startFlow.state.status === 'conflict' ? (
        <StartConflictPrompt
          currentRoutineName={startFlow.state.currentRoutineName}
          onContinue={() => {
            void startFlow.continueCurrent();
          }}
          onReplace={() => {
            void startFlow.replaceCurrent();
          }}
          onCancel={startFlow.cancel}
        />
      ) : null}
      <View style={styles.row}>
        <AppButton
          label={t('common.edit')}
          variant="secondary"
          onPress={() => navigation.navigate('RoutineEditor', { routineId })}
          testID="detail-edit"
        />
        <AppButton
          label={t('detail.duplicate')}
          variant="secondary"
          onPress={handleDuplicate}
          disabled={busy}
          testID="detail-duplicate"
        />
        <AppButton label={t('common.delete')} variant="danger" onPress={confirmDelete} testID="detail-delete" />
      </View>

      <SectionTitle>{t('detail.actionOrder')}</SectionTitle>
      {loaded.steps.map((step, index) => (
        <Card key={step.id}>
          <View style={styles.stepRow}>
            <ActionIconTile source={actionIconFor(step.displayName)} size={48} />
            <View style={styles.stepInfo}>
              <Text style={styles.stepName} maxFontSizeMultiplier={1.5}>
                {t('detail.stepItem', { index: index + 1, name: step.displayName })}
              </Text>
              <Text style={styles.meta} maxFontSizeMultiplier={1.5}>
                {t('detail.stepMeta', { duration: formatDuration(step.durationSec), transition: formatDuration(step.transitionSec) })}
              </Text>
            </View>
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  heroInfo: {
    flex: 1,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  stepRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  stepInfo: {
    flex: 1,
  },
  meta: {
    marginTop: spacing.xs,
    fontSize: 14,
    color: colors.textMuted,
  },
  stepName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
