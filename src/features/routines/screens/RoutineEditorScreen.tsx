import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Action } from '../../../domain/action/Action';
import { useNavigation, useRoute } from '../../../app/navigation/NavigationContext';
import { useServices } from '../../../app/providers/ServicesContext';
import { useSettings } from '../../../app/providers/SettingsContext';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { AppButton } from '../../../shared/components/AppButton';
import { NoticeBanner } from '../../../shared/components/NoticeBanner';
import { Screen } from '../../../shared/components/Screen';
import { spacing } from '../../../shared/theme';
import { useRoutineDraft } from '../hooks/useRoutineDraft';
import { ActionLibraryPicker } from '../components/ActionLibraryPicker';
import { BatchActionInput } from '../components/BatchActionInput';
import { RoutineFormHeader } from '../components/RoutineFormHeader';
import { RoutineStepList } from '../components/RoutineStepList';
import { TrainingTypeSelector } from '../components/TrainingTypeSelector';
import { StepEditor, type StepEditValues } from '../components/StepEditor';
import { listLibraryActions } from '../../actions/services/actionLibraryService';

export function RoutineEditorScreen() {
  const services = useServices();
  const navigation = useNavigation();
  const { settings, loading: settingsLoading } = useSettings();
  const { t } = useLanguage();
  const params = useRoute('RoutineEditor');
  const routineId = params?.routineId;

  const draftApi = useRoutineDraft({ services, routineId, defaults: settings });
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [actions, setActions] = useState<Action[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!pickerVisible) {
      return;
    }
    let cancelled = false;
    listLibraryActions(services.actions)
      .then((loaded) => {
        if (!cancelled) {
          setActions(loaded);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setActions([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pickerVisible, services]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await draftApi.save();
      if (routineId) {
        navigation.goBack();
      } else {
        navigation.replace('RoutineDetail', { routineId: saved.routine.id });
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t('editor.saveError'));
    } finally {
      setSaving(false);
    }
  }, [draftApi, navigation, routineId, t]);

  const { draft } = draftApi;

  if (settingsLoading || draftApi.loading || !draft) {
    return (
      <Screen title={routineId ? t('editor.title.edit') : t('editor.title.new')} onBack={navigation.goBack}>
        <NoticeBanner title={draftApi.error ?? t('common.loading')} />
      </Screen>
    );
  }

  const editingStep = editingStepId
    ? draft.steps.find((step) => step.id === editingStepId) ?? null
    : null;
  const pairMateId = editingStepId ? draftApi.pairMateId(editingStepId) : undefined;
  const pairMateName = pairMateId
    ? draft.steps.find((step) => step.id === pairMateId)?.displayName
    : undefined;

  return (
    <Screen
      title={routineId ? t('editor.title.edit') : t('editor.title.new')}
      onBack={navigation.goBack}
      headerRight={<AppButton label={t('editor.save')} onPress={handleSave} disabled={saving} testID="routine-save" />}
    >
      {draftApi.error || saveError ? (
        <NoticeBanner tone="error" title={t('editor.saveError')} message={saveError ?? draftApi.error ?? ''} />
      ) : null}

      <RoutineFormHeader
        name={draft.name}
        defaultDurationSec={draft.defaultDurationSec}
        defaultTransitionSec={draft.defaultTransitionSec}
        category={draft.category}
        onChangeName={draftApi.setName}
        onChangeDefaultDuration={draftApi.setDefaultDurationSec}
        onChangeDefaultTransition={draftApi.setDefaultTransitionSec}
        onChangeCategory={draftApi.setCategory}
      />

      <TrainingTypeSelector value={draft.trainingTypeId} onChange={draftApi.setTrainingTypeId} />

      <BatchActionInput onAdd={draftApi.addBatch} />

      <View style={styles.libraryRow}>
        <AppButton
          label={t('editor.addFromLibrary')}
          variant="secondary"
          onPress={() => setPickerVisible(true)}
          testID="routine-open-picker"
        />
      </View>

      <RoutineStepList
        steps={draft.steps}
        onEdit={(stepId) => setEditingStepId(stepId)}
        onMove={draftApi.moveStep}
        onDuplicate={draftApi.duplicateStep}
        onDelete={draftApi.removeStep}
      />

      <View style={styles.footer}>
        <AppButton label={t('editor.saveFooter')} onPress={handleSave} disabled={saving} testID="routine-save-footer" />
      </View>

      <StepEditor
        step={editingStep}
        pairMateName={pairMateName}
        onClose={() => setEditingStepId(null)}
        onSubmit={(values: StepEditValues, scope) => {
          if (!editingStepId) {
            return;
          }
          draftApi.updateStep(editingStepId, values, scope);
        }}
      />

      <ActionLibraryPicker
        visible={pickerVisible}
        actions={actions}
        onClose={() => setPickerVisible(false)}
        onConfirm={(selected) => {
          draftApi.addActions(selected);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  libraryRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: spacing.md,
  },
  footer: {
    marginTop: spacing.md,
  },
});
