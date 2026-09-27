import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DURATION_MAX_SEC, DURATION_MIN_SEC, TRANSITION_MAX_SEC, TRANSITION_MIN_SEC } from '../../../domain/routine/constants';
import { StepperField, TextField } from '../../../shared/components/Fields';
import { Card } from '../../../shared/components/Layout';
import { colors, MIN_TOUCH_SIZE, radius, spacing } from '../../../shared/theme';

/**
 * Routine name + the two defaults that new steps inherit (T025, FR-002/005/006).
 *
 * The Home group is no longer chosen here: since TASK-021-F2 the Home sections
 * are the training types themselves (TASK-021-B3's selector, one screen down),
 * so a routine cannot end up in two different places on Home and in Statistics.
 */
export function RoutineFormHeader({
  name,
  defaultDurationSec,
  defaultTransitionSec,
  onChangeName,
  onChangeDefaultDuration,
  onChangeDefaultTransition,
}: {
  name: string;
  defaultDurationSec: number;
  defaultTransitionSec: number;
  onChangeName: (name: string) => void;
  onChangeDefaultDuration: (seconds: number) => void;
  onChangeDefaultTransition: (seconds: number) => void;
}) {
  return (
    <Card>
      <TextField
        label="流程名称"
        value={name}
        onChangeText={onChangeName}
        placeholder="例如：肩颈放松"
        testID="routine-name-input"
      />
      <View style={styles.defaults}>
        <StepperField
          label="默认每个动作时长"
          value={defaultDurationSec}
          onChange={onChangeDefaultDuration}
          min={DURATION_MIN_SEC}
          max={DURATION_MAX_SEC}
          step={5}
          testID="routine-default-duration"
        />
        <StepperField
          label="默认过渡时长"
          value={defaultTransitionSec}
          onChange={onChangeDefaultTransition}
          min={TRANSITION_MIN_SEC}
          max={TRANSITION_MAX_SEC}
          step={5}
          testID="routine-default-transition"
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  defaults: {
    marginTop: spacing.sm,
  },
});
