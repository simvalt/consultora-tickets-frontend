// Credencial efimera: el token OIDC lo entrega Jenkins; no se guarda en el repo.
import { writeFileSync } from 'node:fs';

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS || !process.env.ID_TOKEN_FILE) {
  throw new Error('Jenkins debe definir GOOGLE_APPLICATION_CREDENTIALS e ID_TOKEN_FILE.');
}
writeFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, JSON.stringify({
  type: 'external_account',
  audience: '//iam.googleapis.com/projects/771685458609/locations/global/workloadIdentityPools/jenkins-wif/providers/jenkins-oidc',
  subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
  token_url: 'https://sts.googleapis.com/v1/token',
  service_account_impersonation_url: 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/jenkins-tickets-hosting@sivalt-tickets-demo.iam.gserviceaccount.com:generateAccessToken',
  credential_source: { file: process.env.ID_TOKEN_FILE },
}) + '\n', { mode: 0o600 });
