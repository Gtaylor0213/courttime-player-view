import { LegalPage } from './LegalPage';
import source from '../../../legal/ACCOUNT_DELETION.md?raw';

export function AccountDeletionPage() {
  return <LegalPage title="Account Deletion" source={source} />;
}
