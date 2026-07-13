# Tasks — Backend Branding

## Tasks

- [ ] 1. Create `templates/mail/fragments/branding.html`
  - [ ] 1.1 Create email-header fragment with `${brandingName}` variable
  - [ ] 1.2 Create email-footer fragment with `${brandingName}` and `${brandingSupportUrl}`
  - [ ] 1.3 No hardcoded "UTMStack" or "NilaChakra" strings in the fragment itself

- [ ] 2. Update `MailService.java`
  - [ ] 2.1 Constructor-inject `ApplicationProperties`
  - [ ] 2.2 Add `brandingName` and `brandingSupportUrl` to every Thymeleaf context
  - [ ] 2.3 Verify `mvn -s settings.xml -B` compiles

- [ ] 3. Update email templates (all 9)
  - [ ] 3.1 `activationEmail.html`
  - [ ] 3.2 `alertEmail.html` — remove `<b>UTM</b><b>STACK</b>` styled header
  - [ ] 3.3 `alertEmailAttachment.html`
  - [ ] 3.4 `complianceScheduleEmail.html`
  - [ ] 3.5 `creationEmail.html`
  - [ ] 3.6 `elasticClusterStatusEmail.html`
  - [ ] 3.7 `newIncidentEmail.html`
  - [ ] 3.8 `passwordResetEmail.html`
  - [ ] 3.9 `tfaCodeEmail.html`

- [ ] 4. Update `application.yml` API docs title
  - [ ] 4.1 Change `jhipster.api-docs.title` to `${application.branding.name} Backend API`
  - [ ] 4.2 VERIFY `spring.application.name` is still `UTMStack-API` (must not change)

- [ ] 5. Verification
  - [ ] 5.1 `grep -r 'UTMStack\|utmstack' backend/src/main/resources/templates/mail` → zero
  - [ ] 5.2 `mvn -s settings.xml -B` → compiles

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 0,
      "tasks": [1, 2, 4],
      "description": "Create fragment, update MailService, update YAML"
    },
    {
      "wave": 1,
      "tasks": [3],
      "description": "Update all 9 email templates",
      "dependsOn": [0]
    },
    {
      "wave": 2,
      "tasks": [5],
      "description": "Verify",
      "dependsOn": [1]
    }
  ]
}
```
