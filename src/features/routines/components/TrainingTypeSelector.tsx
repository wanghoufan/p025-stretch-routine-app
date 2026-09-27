import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useServices } from '../../../app/providers/ServicesContext';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { Card } from '../../../shared/components/Layout';
import { colors, MIN_TOUCH_SIZE, radius, spacing } from '../../../shared/theme';
import type { TrainingTypeInfo } from '../../../domain/statistics/history';

/**
 * Training-type picker in the routine editor (TASK-021-B3, V1.3 HD-1).
 *
 * The options are the rows of the `training_types` table via
 * `listTrainingTypes()` — never a hardcoded list — plus the 未分类 choice,
 * whose label comes from the i18n dictionary (it is a display bucket, not a
 * fourth preset type). Selecting 未分类 produces an explicit `null`, which
 * re-classifies an existing routine on save.
 */
export function TrainingTypeSelector({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (typeId: string | null) => void;
}) {
  const services = useServices();
  const { language, t } = useLanguage();
  const [types, setTypes] = useState<TrainingTypeInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    services.history
      .listTrainingTypes()
      .then((loaded) => {
        if (!cancelled) {
          setTypes(loaded);
        }
      })
      .catch(() => {
        // Table read failed: fall back to the 未分类 choice only, so the
        // editor keeps working without inventing options.
        if (!cancelled) {
          setTypes([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [services]);

  return (
    <Card>
      <Text style={styles.label} maxFontSizeMultiplier={1.5} accessibilityRole="header">
        {t('editor.trainingType')}
      </Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={t('editor.trainingType')}>
        {types.map((type) => {
          const selected = value === type.typeId;
          return (
            <Pressable
              key={type.typeId}
              testID={`routine-type-${type.typeId}`}
              onPress={() => onChange(type.typeId)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${t('editor.trainingType')}：${language === 'zh' ? type.nameZh : type.nameEn}`}
              style={({ pressed }) => [
                styles.chip,
                selected ? styles.chipSelected : null,
                pressed ? styles.chipPressed : null,
              ]}
            >
              <Text
                style={[styles.chipLabel, selected ? styles.chipLabelSelected : null]}
                maxFontSizeMultiplier={1.4}
              >
                {language === 'zh' ? type.nameZh : type.nameEn}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          testID="routine-type-unclassified"
          onPress={() => onChange(null)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === null }}
          accessibilityLabel={`${t('editor.trainingType')}：${t('stats.type.unclassified')}`}
          style={({ pressed }) => [
            styles.chip,
            value === null ? styles.chipSelected : null,
            pressed ? styles.chipPressed : null,
          ]}
        >
          <Text
            style={[styles.chipLabel, value === null ? styles.chipLabelSelected : null]}
            maxFontSizeMultiplier={1.4}
          >
            {t('stats.type.unclassified')}
          </Text>
        </Pressable>
      </View>
      <Text style={styles.hint} maxFontSizeMultiplier={1.5} testID="routine-type-hint">
        {t('editor.trainingTypeHint')}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  chip: {
    minHeight: MIN_TOUCH_SIZE,
    minWidth: MIN_TOUCH_SIZE,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.primary,
  },
  chipPressed: {
    opacity: 0.8,
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  chipLabelSelected: {
    color: colors.primary,
  },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
});
