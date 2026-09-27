import type { ReactNode } from 'react';
import type { AppServices } from './createAppServices';
import { ServicesProvider } from './ServicesContext';
import { SettingsProvider } from './SettingsContext';
import { SpeechProvider } from './SpeechContext';
import { AmbientProvider } from './AmbientContext';
import { LanguageProvider } from './LanguageContext';
import type { TtsSpeaker } from '../../services/tts/ttsService';
import type { AmbientPlayer } from '../../services/audio/ambientAudioService';

/**
 * App-wide providers, in dependency order:
 * services -> settings -> speech -> ambient -> language.
 *
 * Navigation is deliberately not included: screens and tests can supply their
 * own navigation value.
 */
export function AppProviders({
  services,
  speaker,
  ambientPlayer,
  children,
}: {
  services: AppServices;
  speaker?: TtsSpeaker;
  ambientPlayer?: AmbientPlayer;
  children: ReactNode;
}) {
  return (
    <ServicesProvider services={services}>
      <SettingsProvider>
        <SpeechProvider speaker={speaker}>
          <AmbientProvider player={ambientPlayer}>
            <LanguageProvider>{children}</LanguageProvider>
          </AmbientProvider>
        </SpeechProvider>
      </SettingsProvider>
    </ServicesProvider>
  );
}
