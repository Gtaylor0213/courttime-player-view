import { LegalPage } from './LegalPage';
import source from '../../../legal/TERMS_OF_SERVICE.md?raw';

export function TermsOfServicePage() {
  return <LegalPage title="Terms of Service" source={source} />;
}
