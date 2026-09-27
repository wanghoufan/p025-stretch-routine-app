import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { useServices } from '../../../app/providers/ServicesContext';
import { useSettings } from '../../../app/providers/SettingsContext';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { useSpeech } from '../../../app/providers/SpeechContext';
import { clearSeededExamples } from '../../../data/seeds';
import { AppButton } from '../../../shared/components/AppButton';
import { Card, SectionTitle } from '../../../shared/components/Layout';
import { NoticeBanner } from '../../../shared/components/NoticeBanner';
import { Screen } from '../../../shared/components/Screen';
import { RadioGroupField, StepperField } from '../../../shared/components/Fields';
import { colors, fontSizes, spacing } from '../../../shared/theme';
import { LANGUAGES } from '../../../shared/i18n';
import {
  COUNTDOWN_WARNING_MAX_SEC,
  COUNTDOWN_WARNING_MIN_SEC,
  SPEECH_RATE_MAX,
  SPEECH_RATE_MIN,
  SPEECH_RATE_STEP,
} from '../settingsModel';
import {
  AMBIENT_SOUND_META,
  AMBIENT_SOUND_OPTIONS,
  ambientSoundTestId,
} from '../ambientSound';
import { DURATION_MAX_SEC, DURATION_MIN_SEC, TRANSITION_MAX_SEC, TRANSITION_MIN_SEC } from '../../../domain/routine/constants';

export function SettingsScreen() {
  const navigation = useNavigation();
  const services = useServices();
  const { settings, loading, update } = useSettings();
  const { language, setLanguage, t } = useLanguage();
  const { tts, ttsError, dismissTtsError } = useSpeech();
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState<string | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);
  const [clearingStats, setClearingStats] = useState(false);
  const [clearStatsResult, setClearStatsResult] = useState<string | null>(null);
  const [clearStatsError, setClearStatsError] = useState<string | null>(null);
  const [speechTest, setSpeechTest] = useState<string | null>(null);

  const runSpeechTest = useCallback(() => {
    dismissTtsError();
    if (!settings.ttsEnabled) {
      setSpeechTest(t('settings.speechTestOff'));
      return;
    }
    tts.resetSession();
    const queued = tts.announce({
      key: `speech-test:${Date.now()}`,
      text: t('settings.speechTestText'),
      interrupt: true,
    });
    setSpeechTest(queued ? t('settings.speechTestOk') : t('settings.speechTestFail'));
  }, [dismissTtsError, settings.ttsEnabled, tts, t]);

  const runClear = useCallback(async () => {
    setClearing(true);
    setClearResult(null);
    setClearError(null);
    try {
      const result = await clearSeededExamples({
        db: services.db,
        clock: services.wallClock,
        generateId: services.generateId,
      });
      const total = result.removedRoutineNames.length + result.removedActionNames.length;
      setClearResult(
        total === 0
          ? t('settings.clearEmpty')
          : t('settings.clearSuccess', { routines: result.removedRoutineNames.length, actions: result.removedActionNames.length }),
      );
    } catch (clearFailure) {
      setClearError(clearFailure instanceof Error ? clearFailure.message : t('settings.clearError'));
    } finally {
      setClearing(false);
    }
  }, [services, t]);

  const confirmClear = useCallback(() => {
    Alert.alert(
      t('settings.clearConfirm'),
      t('settings.clearConfirmMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.clearExamples'),
          style: 'destructive',
          onPress: () => {
            void runClear();
          },
        },
      ],
      { cancelable: true },
    );
  }, [runClear, t]);

  // TASK-021-B2 (HD-4): statistics clearing is strictly isolated — it must
  // never touch routines, the action library, the active session or the seed
  // markers. The copy deliberately differs from 清除示例数据 to prevent the
  // misreading that clearing stats deletes routines.
  const runClearStats = useCallback(async () => {
    setClearingStats(true);
    setClearStatsResult(null);
    setClearStatsError(null);
    try {
      await services.history.clearAllStats();
      setClearStatsResult(t('settings.clearStatsDone'));
    } catch {
      setClearStatsError(t('settings.clearStatsError'));
    } finally {
      setClearingStats(false);
    }
  }, [services, t]);

  const confirmClearStats = useCallback(() => {
    Alert.alert(
      t('settings.clearStats'),
      t('settings.clearStatsConfirmMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.clearStats'),
          style: 'destructive',
          onPress: () => {
            void runClearStats();
          },
        },
      ],
      { cancelable: true },
    );
  }, [runClearStats, t]);

  return (
    <Screen title={t('settings.title')} onBack={navigation.goBack}>
      {loading ? <NoticeBanner title={t('settings.reading')} /> : null}
      {clearResult ? <NoticeBanner title={clearResult} /> : null}
      {clearError ? <NoticeBanner tone="error" title={t('settings.clearError')} message={clearError} /> : null}
      {clearStatsResult ? <NoticeBanner title={clearStatsResult} /> : null}
      {clearStatsError ? (
        <NoticeBanner tone="error" title={t('settings.clearStatsError')} message={clearStatsError} />
      ) : null}

      <SectionTitle>{t('settings.language')}</SectionTitle>
      <Card>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel} maxFontSizeMultiplier={1.5}>
            {t('settings.language')}
          </Text>
          <View style={styles.languageOptions}>
            {LANGUAGES.map((lang) => (
              <AppButton
                key={lang.value}
                label={lang.label}
                variant={language === lang.value ? 'primary' : 'secondary'}
                onPress={() => setLanguage(lang.value)}
                testID={`settings-language-${lang.value}`}
                style={styles.languageButton}
              />
            ))}
          </View>
        </View>
        <Text style={styles.hint} maxFontSizeMultiplier={1.5}>
          {t('settings.languageDesc')}
        </Text>
      </Card>

      <SectionTitle>{t('settings.speech')}</SectionTitle>
      <Card>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel} maxFontSizeMultiplier={1.5}>
            {t('settings.ttsEnabled')}
          </Text>
          <Switch
            value={settings.ttsEnabled}
            onValueChange={(value) => {
              void update({ ttsEnabled: value });
            }}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.text}
            accessibilityLabel={t('settings.ttsEnabled')}
            testID="settings-tts-enabled"
          />
        </View>
        <Text style={styles.hint} maxFontSizeMultiplier={1.5}>
          {t('settings.ttsEnabledDesc')}
        </Text>

        <StepperField
          label={t('settings.speechRate')}
          value={settings.speechRate}
          onChange={(value) => {
            void update({ speechRate: value });
          }}
          min={SPEECH_RATE_MIN}
          max={SPEECH_RATE_MAX}
          step={SPEECH_RATE_STEP}
          formatValue={(value) => `${value.toFixed(1)}x`}
          testID="settings-speech-rate"
        />

        <AppButton
          label={t('settings.speechTest')}
          variant="secondary"
          onPress={runSpeechTest}
          accessibilityHint={t('settings.speechTestHint')}
          testID="settings-speech-test"
          style={styles.clearButton}
        />
        {speechTest ? <NoticeBanner title={speechTest} /> : null}
        {ttsError ? (
          <NoticeBanner tone="error" title={t('settings.ttsError')} message={ttsError} />
        ) : null}

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel} maxFontSizeMultiplier={1.5}>
            {t('settings.countdownWarning')}
          </Text>
          <Switch
            value={settings.countdownWarningEnabled}
            onValueChange={(value) => {
              void update({ countdownWarningEnabled: value });
            }}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.text}
            accessibilityLabel={t('settings.countdownWarning')}
            testID="settings-countdown-enabled"
          />
        </View>
        <StepperField
          label={t('settings.countdownSec')}
          value={settings.countdownWarningSec}
          onChange={(value) => {
            void update({ countdownWarningSec: value });
          }}
          min={COUNTDOWN_WARNING_MIN_SEC}
          max={COUNTDOWN_WARNING_MAX_SEC}
          step={1}
          testID="settings-countdown-sec"
        />

        <RadioGroupField
          label={t('settings.ambientSound')}
          value={settings.ambientSound}
          onChange={(value) => {
            void update({ ambientSound: value });
          }}
          options={AMBIENT_SOUND_OPTIONS.map((option) => ({
            value: option,
            label: t(`settings.ambient.${option}`),
            description: AMBIENT_SOUND_META[option].description ? t(`settings.ambient.${option}Desc`) : undefined,
            testID: ambientSoundTestId(option),
          }))}
          testID="settings-ambient-group"
          hint={t('settings.ambientSoundDesc')}
        />
      </Card>

      <SectionTitle>{t('settings.defaults')}</SectionTitle>
      <Card>
        <StepperField
          label={t('settings.defaultDuration')}
          value={settings.defaultDurationSec}
          onChange={(value) => {
            void update({ defaultDurationSec: value });
          }}
          min={DURATION_MIN_SEC}
          max={DURATION_MAX_SEC}
          step={5}
          testID="settings-default-duration"
        />
        <StepperField
          label={t('settings.defaultTransition')}
          value={settings.defaultTransitionSec}
          onChange={(value) => {
            void update({ defaultTransitionSec: value });
          }}
          min={TRANSITION_MIN_SEC}
          max={TRANSITION_MAX_SEC}
          step={5}
          testID="settings-default-transition"
        />
        <Text style={styles.hint} maxFontSizeMultiplier={1.5}>
          {t('settings.defaultsDesc')}
        </Text>
      </Card>

      <SectionTitle>{t('settings.examples')}</SectionTitle>
      <Card>
        <Text style={styles.hint} maxFontSizeMultiplier={1.5}>
          {t('settings.examplesDesc')}
        </Text>
        <AppButton
          label={t('settings.clearExamples')}
          variant="danger"
          onPress={confirmClear}
          disabled={clearing}
          accessibilityHint={t('settings.clearExamplesHint')}
          testID="settings-clear-examples"
          style={styles.clearButton}
        />
      </Card>

      <SectionTitle>{t('settings.stats')}</SectionTitle>
      <Card>
        <Text style={styles.hint} maxFontSizeMultiplier={1.5}>
          {t('settings.statsDesc')}
        </Text>
        <AppButton
          label={t('settings.clearStats')}
          variant="danger"
          onPress={confirmClearStats}
          disabled={clearingStats}
          accessibilityHint={t('settings.statsDesc')}
          testID="settings-clear-stats"
          style={styles.clearButton}
        />
      </Card>

      <SectionTitle>{t('settings.about')}</SectionTitle>
      <Card>
        <Text style={styles.about} maxFontSizeMultiplier={1.5}>
          {t('settings.aboutDesc')}
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  switchLabel: {
    flex: 1,
    fontSize: fontSizes.body,
    color: colors.text,
  },
  languageOptions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  languageButton: {
    paddingHorizontal: spacing.md,
    minHeight: 40,
  },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  clearButton: {
    marginTop: spacing.md,
  },
  about: {
    fontSize: fontSizes.meta,
    color: colors.textMuted,
    lineHeight: 21,
  },
});
