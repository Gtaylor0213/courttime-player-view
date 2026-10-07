import { LegalPage } from './LegalPage';
import source from '../../../legal/PRIVACY_POLICY.md?raw';

export function PrivacyPolicyPage() {
  return <LegalPage title="Privacy Policy" source={source} />;
}
