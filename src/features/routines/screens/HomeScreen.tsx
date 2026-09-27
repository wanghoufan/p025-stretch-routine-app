import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { useServices } from '../../../app/providers/ServicesContext';
import { useSettings } from '../../../app/providers/SettingsContext';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { useSpeech } from '../../../app/providers/SpeechContext';
import { AppButton } from '../../../shared/components/AppButton';
import { EmptyState, SectionTitle } from '../../../shared/components/Layout';
import { NoticeBanner } from '../../../shared/components/NoticeBanner';
import { Screen } from '../../../shared/components/Screen';
import { spacing } from '../../../shared/theme';
import { ActiveSessionBanner } from '../../runner/components/ActiveSessionBanner';
import { StartConflictPrompt } from '../../runner/components/StartConflictPrompt';
import { useStartRoutine } from '../../runner/hooks/useStartRoutine';
import { RoutineCard } from '../components/RoutineCard';
import { groupRoutines } from '../services/routineGroups';
import { useRoutines } from '../hooks/useRoutines';

export function HomeScreen() {
  const navigation = useNavigation();
  const services = useServices();
  const { tts } = useSpeech();
  const { settings } = useSettings();
  const { t } = useLanguage();
  const { routines, activeSession, loading, error, refresh } = useRoutines(services);
  const routineGroups = useMemo(() => groupRoutines(routines), [routines]);

  const openRunner = useCallback(() => navigation.navigate('Runner', undefined), [navigation]);
  const startFlow = useStartRoutine(services, tts, settings, openRunner);

  const openRoutine = useCallback(
    (routineId: string) => navigation.navigate('RoutineDetail', { routineId }),
    [navigation],
  );

  const startRoutine = useCallback(
    (routineId: string) => {
      void startFlow.start(routineId);
    },
    [startFlow],
  );

  const continueSession = useCallback(() => {
    void startFlow.resume();
  }, [startFlow]);

  return (
    <Screen
      title={t('home.title')}
      headerRight={
        <>
          <AppButton
            label={t('home.actionLibrary')}
            variant="secondary"
            onPress={() => navigation.navigate('ActionLibrary', undefined)}
            testID="home-action-library"
          />
          <AppButton
            label={t('home.settings')}
            variant="secondary"
            onPress={() => navigation.navigate('Settings', undefined)}
            testID="home-settings"
          />
        </>
      }
    >
      {error ? (
        <NoticeBanner
          tone="error"
          title={t('home.readError')}
          message={error}
          actionLabel={t('common.retry')}
          onAction={() => {
            void refresh();
          }}
        />
      ) : null}

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
          busy={false}
        />
      ) : null}

      {activeSession ? (
        <ActiveSessionBanner
          session={activeSession}
          onContinue={continueSession}
          busy={startFlow.state.status === 'busy'}
        />
      ) : null}

      <AppButton
        label={t('home.newRoutine')}
        onPress={() => navigation.navigate('RoutineEditor', {})}
        testID="home-new-routine"
        style={styles.newButton}
      />

      <AppButton
        label={t('home.historyStats')}
        variant="secondary"
        onPress={() => navigation.navigate('Stats', undefined)}
        testID="home-history-stats"
        style={styles.statsEntry}
      />

      {loading ? null : routines.length === 0 ? (
        <EmptyState
          title={t('home.noRoutines')}
          description={t('home.noRoutinesDesc')}
          actionLabel={t('home.newRoutine')}
          onAction={() => navigation.navigate('RoutineEditor', {})}
        />
      ) : (
        <View>
          <SectionTitle>{t('home.routineCount', { count: routines.length })}</SectionTitle>
          {routineGroups.map((group) => (
            <View key={group.key} testID={group.key}>
              <SectionTitle>
                {`${t(`home.scene.${group.scene}`)} (${group.count})`}
              </SectionTitle>
              {group.routines.map((summary) => (
                <RoutineCard
                  key={summary.id}
                  summary={summary}
                  hasActiveSession={activeSession?.routineId === summary.id}
                  onOpen={() => openRoutine(summary.id)}
                  onStart={() => startRoutine(summary.id)}
                  badge={group.scene === '核心' ? summary.difficulty : undefined}
                  scene={group.scene}
                />
              ))}
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  newButton: {
    marginTop: spacing.sm,
  },
  statsEntry: {
    marginTop: spacing.sm,
  },
});
