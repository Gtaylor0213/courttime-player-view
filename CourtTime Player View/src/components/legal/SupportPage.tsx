import { LegalPage } from './LegalPage';
import source from '../../../legal/SUPPORT.md?raw';

export function SupportPage() {
  return <LegalPage title="Support" source={source} />;
}
