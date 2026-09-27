import { useNavigation } from './NavigationContext';
import { HomeScreen } from '../../features/routines/screens/HomeScreen';
import { RoutineDetailScreen } from '../../features/routines/screens/RoutineDetailScreen';
import { RoutineEditorScreen } from '../../features/routines/screens/RoutineEditorScreen';
import { RunnerScreen } from '../../features/runner/screens/RunnerScreen';
import { CompletionScreen } from '../../features/runner/screens/CompletionScreen';
import { ActionLibraryScreen } from '../../features/actions/screens/ActionLibraryScreen';
import { SettingsScreen } from '../../features/settings/screens/SettingsScreen';
import { StatsScreen } from '../../features/stats/screens/StatsScreen';

/** Renders the top route of the in-app stack. */
export function AppNavigator() {
  const { route } = useNavigation();

  switch (route.name) {
    case 'Home':
      return <HomeScreen />;
    case 'RoutineDetail':
      return <RoutineDetailScreen />;
    case 'RoutineEditor':
      return <RoutineEditorScreen />;
    case 'Runner':
      return <RunnerScreen />;
    case 'Completion':
      return <CompletionScreen />;
    case 'ActionLibrary':
      return <ActionLibraryScreen />;
    case 'Settings':
      return <SettingsScreen />;
    case 'Stats':
      return <StatsScreen />;
    default:
      return <HomeScreen />;
  }
}
