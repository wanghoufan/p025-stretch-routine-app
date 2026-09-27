import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { useServices } from '../../../app/providers/ServicesContext';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { AppButton } from '../../../shared/components/AppButton';
import { Card, SectionTitle } from '../../../shared/components/Layout';
import { NoticeBanner } from '../../../shared/components/NoticeBanner';
import { Screen } from '../../../shared/components/Screen';
import { colors, fontSizes, spacing } from '../../../shared/theme';
import type {
  SessionHistoryRecord,
  StatsAnomalyNotice,
  TrainingTypeInfo,
} from '../../../domain/statistics/history';
import type { SessionTotals, SessionTypeTotals } from '../../../data/repositories/sessionHistoryRepository';
import { formatStatsDuration } from '../statsFormat';

/**
 * History & stats screen (TASK-021-B2, V1.3 DoD).
 *
 * First release contents only: grand total, per-training-type totals (from the
 * `training_types` table — never a hardcoded list), the last 10 records with
 * single-record delete, the local-only privacy line and the honest empty
 * state. Day/week/month trends are deliberately out of scope (V1.3).
 *
 * The caveat banner is driven exclusively by `listActiveAnomalies()`: expected
 * exclusions (0ms / ERROR / pre-upgrade) never reach this screen as anomalies,
 * because the B1 archive layer already filtered them out.
 */

const RECENT_LIMIT = 10;

interface StatsData {
  totals: SessionTotals;
  byType: SessionTypeTotals[];
  types: TrainingTypeInfo[];
  recent: SessionHistoryRecord[];
  anomalies: StatsAnomalyNotice[];
}

export function StatsScreen() {
  const navigation = useNavigation();
  const services = useServices();
  const { language, t } = useLanguage();
  const [data, setData] = useState<StatsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [totals, byType, types, recent, anomalies] = await Promise.all([
        services.history.getTotals(),
        services.history.getTotalsByType(),
        services.history.listTrainingTypes(),
        services.history.getRecent(RECENT_LIMIT),
        services.history.listActiveAnomalies(),
      ]);
      setData({ totals, byType, types, recent, anomalies });
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('stats.readError'));
    }
  }, [services, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const confirmDelete = useCallback((record: SessionHistoryRecord) => {
    Alert.alert(
      t('stats.deleteConfirmTitle'),
      t('stats.deleteConfirmMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await services.history.deleteRecord(record.sessionId);
                await reload();
              } catch {
                setError(t('stats.deleteError'));
              }
            })();
          },
        },
      ],
      { cancelable: true },
    );
  }, [services, t, reload]);

  const dismissCaveat = useCallback(() => {
    void (async () => {
      try {
        await services.history.dismissAllAnomalies(services.wallClock.nowMs());
        setData((previous) => (previous ? { ...previous, anomalies: [] } : previous));
      } catch {
        setError(t('stats.readError'));
      }
    })();
  }, [services, t]);

  const typeBuckets = new Map<string | null, SessionTypeTotals>();
  for (const bucket of data?.byType ?? []) {
    typeBuckets.set(bucket.trainingTypeId, bucket);
  }
  const unclassifiedBucket = typeBuckets.get(null);
  const anomalyReasons = [
    ...new Set((data?.anomalies ?? []).map((anomaly) => t(`stats.anomaly.${anomaly.reasonCode}`))),
  ];

  return (
    <Screen title={t('stats.title')} onBack={navigation.goBack}>
      {error ? (
        <NoticeBanner
          tone="error"
          title={t('stats.readError')}
          message={error}
          actionLabel={t('common.retry')}
          onAction={() => {
            void reload();
          }}
        />
      ) : null}

      {data && data.anomalies.length > 0 ? (
        <View testID="stats-anomaly-banner">
          <NoticeBanner
            tone="warning"
            title={t('stats.caveat.lowerThanActual')}
            message={anomalyReasons.join('\n')}
            actionLabel={t('stats.caveat.dismiss')}
            actionTestID="stats-anomaly-dismiss"
            onAction={dismissCaveat}
          />
        </View>
      ) : null}

      {data && data.totals.sessionCount === 0 ? (
        <View style={styles.empty} testID="stats-empty">
          <Text style={styles.emptyTitle} maxFontSizeMultiplier={1.5}>
            {t('stats.emptyTitle')}
          </Text>
          <Text style={styles.emptyDesc} maxFontSizeMultiplier={1.5}>
            {t('stats.emptyDesc')}
          </Text>
        </View>
      ) : null}

      {data && data.totals.sessionCount > 0 ? (
        <>
          <SectionTitle>{t('stats.total')}</SectionTitle>
          <Card style={styles.totalCard}>
            <Text style={styles.totalValue} maxFontSizeMultiplier={1.4} testID="stats-total-value">
              {formatStatsDuration(data.totals.totalStepMs, language)}
            </Text>
            <Text style={styles.totalMeta} maxFontSizeMultiplier={1.5} testID="stats-total-count">
              {t('stats.sessionCount', { count: data.totals.sessionCount })}
            </Text>
          </Card>

          <SectionTitle>{t('stats.byType')}</SectionTitle>
          <Card>
            {data.types.map((type) => {
              const bucket = typeBuckets.get(type.typeId);
              return (
                <View key={type.typeId} style={styles.typeRow} testID={`stats-type-${type.typeId}`}>
                  <Text style={styles.typeLabel} maxFontSizeMultiplier={1.5}>
                    {language === 'zh' ? type.nameZh : type.nameEn}
                  </Text>
                  <Text style={styles.typeValue} maxFontSizeMultiplier={1.5}>
                    {`${formatStatsDuration(bucket?.totalStepMs ?? 0, language)} · ${t('stats.sessionCount', { count: bucket?.sessionCount ?? 0 })}`}
                  </Text>
                </View>
              );
            })}
            {unclassifiedBucket ? (
              <View style={[styles.typeRow, styles.typeRowLast]} testID="stats-type-unclassified">
                <Text style={styles.typeLabel} maxFontSizeMultiplier={1.5}>
                  {t('stats.type.unclassified')}
                </Text>
                <Text style={styles.typeValue} maxFontSizeMultiplier={1.5}>
                  {`${formatStatsDuration(unclassifiedBucket.totalStepMs, language)} · ${t('stats.sessionCount', { count: unclassifiedBucket.sessionCount })}`}
                </Text>
              </View>
            ) : null}
          </Card>

          <SectionTitle>{t('stats.recent')}</SectionTitle>
          <Card>
            {data.recent.length === 0 ? (
              <Text style={styles.hint} maxFontSizeMultiplier={1.5}>
                {t('stats.emptyDesc')}
              </Text>
            ) : (
              data.recent.map((record, index) => (
                <View
                  key={record.sessionId}
                  style={index === data.recent.length - 1 ? styles.typeRowLast : styles.typeRow}
                  testID={`stats-recent-${record.sessionId}`}
                >
                  <View style={styles.recordMain}>
                    <Text style={styles.recordName} maxFontSizeMultiplier={1.5}>
                      {record.routineName}
                    </Text>
                    <Text style={styles.recordMeta} maxFontSizeMultiplier={1.5}>
                      {`${record.endLocalDate} · ${formatStatsDuration(record.totalStepMs, language)}`}
                    </Text>
                    {record.endedEarly ? (
                      <Text style={styles.endedEarlyBadge} maxFontSizeMultiplier={1.5}>
                        {t('stats.endedEarly')}
                      </Text>
                    ) : null}
                  </View>
                  <AppButton
                    label={t('common.delete')}
                    variant="danger"
                    onPress={() => confirmDelete(record)}
                    testID={`stats-delete-${record.sessionId}`}
                    style={styles.deleteButton}
                  />
                </View>
              ))
            )}
          </Card>

          <Text style={styles.note} maxFontSizeMultiplier={1.5}>
            {t('stats.classificationNote')}
          </Text>
        </>
      ) : null}

      <Text style={styles.localNote} maxFontSizeMultiplier={1.5} testID="stats-local-note">
        {t('stats.localOnly')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: fontSizes.section,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: fontSizes.body,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.lg,
  },
  totalCard: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  totalValue: {
    fontSize: fontSizes.display,
    fontWeight: '700',
    color: colors.primary,
  },
  totalMeta: {
    fontSize: fontSizes.meta,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  typeRowLast: {
    borderBottomWidth: 0,
  },
  typeLabel: {
    flex: 1,
    fontSize: fontSizes.body,
    color: colors.text,
  },
  typeValue: {
    fontSize: fontSizes.meta,
    color: colors.textMuted,
  },
  recordMain: {
    flex: 1,
  },
  recordName: {
    fontSize: fontSizes.body,
    color: colors.text,
    fontWeight: '600',
  },
  recordMeta: {
    fontSize: fontSizes.meta,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  endedEarlyBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    fontSize: 12,
    fontWeight: '700',
    color: colors.warningText,
    backgroundColor: colors.warningSoft,
    borderRadius: spacing.sm,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  deleteButton: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  note: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  localNote: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
});
