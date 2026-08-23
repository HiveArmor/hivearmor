import type { IdentityAdministrationView } from '../identity-administration/identityAdministration.types';
import { IdentityAdministrationPage } from '../identity-administration/IdentityAdministrationPage';

export function AdminUsersPage({ initialView = 'directory' }: { initialView?: IdentityAdministrationView }): JSX.Element {
  return <IdentityAdministrationPage initialView={initialView} />;
}
