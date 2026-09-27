import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, MIN_TOUCH_SIZE, radius, spacing } from '../theme';
import { useLanguage } from '../../app/providers/LanguageContext';

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  numberOfLines = 1,
  testID,
  hint,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  numberOfLines?: number;
  testID?: string;
  hint?: string;
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label} maxFontSizeMultiplier={1.5}>
        {label}
      </Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        numberOfLines={multiline ? numberOfLines : undefined}
        autoFocus={autoFocus}
        accessibilityLabel={label}
        accessibilityHint={hint}
        style={[styles.input, multiline ? styles.inputMultiline : null]}
        maxFontSizeMultiplier={1.5}
      />
      {hint ? (
        <Text style={styles.hint} maxFontSizeMultiplier={1.5}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export interface RadioOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  testID?: string;
}

/**
 * Vertical single-choice radio group (TASK-011).
 *
 * Used for the countdown background sound. Each row is a radio for screen
 * readers, carries the Chinese label, and exposes a stable `testID`.
 */
export function RadioGroupField<T extends string>({
  label,
  value,
  options,
  onChange,
  testID,
  hint,
}: {
  label: string;
  value: T;
  options: readonly RadioOption<T>[];
  onChange: (next: T) => void;
  testID?: string;
  hint?: string;
}) {
  return (
    <View style={styles.radioGroup} testID={testID} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={styles.label} maxFontSizeMultiplier={1.5}>
        {label}
      </Text>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={option.testID}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            accessibilityHint={option.description}
            style={({ pressed }) => [
              styles.radioRow,
              selected ? styles.radioSelected : null,
              pressed ? styles.radioPressed : null,
            ]}
          >
            <View style={[styles.radioOuter, selected ? styles.radioOuterSelected : null]}>
              {selected ? <View style={styles.radioInner} /> : null}
            </View>
            <View style={styles.radioText}>
              <Text style={styles.radioLabel} maxFontSizeMultiplier={1.5}>
                {option.label}
              </Text>
              {option.description ? (
                <Text style={styles.radioDescription} maxFontSizeMultiplier={1.5}>
                  {option.description}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
      {hint ? (
        <Text style={styles.hint} maxFontSizeMultiplier={1.5}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function StepperField({
  label,
  value,
  onChange,
  min,
  max,
  step = 5,
  unit = 's',
  testID,
  style,
  formatValue,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  /** Override how the value is rendered, e.g. `1.2x` instead of `1.2`. */
  formatValue?: (value: number) => string;
}) {
  const { t } = useLanguage();
  const decrease = () => onChange(Math.max(min, value - step));
  const increase = () => onChange(Math.min(max, value + step));
  const display = formatValue ? formatValue(value) : `${value}${unit}`;

  return (
    <View style={[styles.stepperRow, style]} testID={testID}>
      <Text style={styles.stepperLabel} maxFontSizeMultiplier={1.5}>
        {label}
      </Text>
      <View style={styles.stepperControls}>
        <Pressable
          testID={testID ? `${testID}-minus` : undefined}
          onPress={decrease}
          disabled={value <= min}
          accessibilityRole="button"
          accessibilityLabel={`${label} ${t('common.minus')} ${step}${unit}`}
          accessibilityState={{ disabled: value <= min }}
          style={({ pressed }) => [
            styles.stepperButton,
            pressed ? styles.stepperPressed : null,
            value <= min ? styles.stepperDisabled : null,
          ]}
        >
          <Text style={styles.stepperButtonText} maxFontSizeMultiplier={1.4}>
            {t('common.minus')}
          </Text>
        </Pressable>
        <Text
          testID={testID ? `${testID}-value` : undefined}
          style={styles.stepperValue}
          maxFontSizeMultiplier={1.5}
          accessibilityLabel={`${label} ${display}`}
        >
          {display}
        </Text>
        <Pressable
          testID={testID ? `${testID}-plus` : undefined}
          onPress={increase}
          disabled={value >= max}
          accessibilityRole="button"
          accessibilityLabel={`${label} ${t('common.plus')} ${step}${unit}`}
          accessibilityState={{ disabled: value >= max }}
          style={({ pressed }) => [
            styles.stepperButton,
            pressed ? styles.stepperPressed : null,
            value >= max ? styles.stepperDisabled : null,
          ]}
        >
          <Text style={styles.stepperButtonText} maxFontSizeMultiplier={1.4}>
            {t('common.plus')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  input: {
    minHeight: MIN_TOUCH_SIZE,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.text,
  },
  inputMultiline: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  hint: {
    marginTop: spacing.xs,
    fontSize: 13,
    color: colors.textMuted,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  stepperLabel: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepperButton: {
    width: MIN_TOUCH_SIZE,
    height: MIN_TOUCH_SIZE,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperPressed: {
    backgroundColor: colors.accentSoft,
  },
  stepperDisabled: {
    opacity: 0.4,
  },
  stepperButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  stepperValue: {
    minWidth: 72,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  radioGroup: {
    paddingVertical: spacing.sm,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_SIZE,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    gap: spacing.md,
  },
  radioSelected: {
    backgroundColor: colors.accentSoft,
  },
  radioPressed: {
    opacity: 0.75,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  radioText: {
    flex: 1,
  },
  radioLabel: {
    fontSize: 16,
    color: colors.text,
  },
  radioDescription: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
});
