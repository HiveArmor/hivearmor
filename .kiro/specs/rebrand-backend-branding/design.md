# Design — Backend Branding

## Overview

Replace UTMStack brand strings in backend email templates and API docs. The `application.branding.*` YAML block already exists with `NilaChakra` defaults.

## Components and Interfaces

### `branding.html` fragment (NEW)

```html
<!DOCTYPE html>
<html xmlns:th="http://www.thymeleaf.org">
<body>
<div th:fragment="email-header">
  <h2 th:text="${brandingName}" style="color:#151922; font-family:Inter,sans-serif;">NilaChakra</h2>
  <p style="color:#8899BB; font-size:12px;">Enterprise SIEM + XDR</p>
</div>
<div th:fragment="email-footer">
  <hr style="border:1px solid #eee; margin:24px 0 16px;">
  <p style="font-family:Inter,sans-serif; font-size:13px; color:#666;">
    Best regards,<br>
    <strong th:text="${brandingName}">NilaChakra</strong><br>
    <a th:href="${brandingSupportUrl}" th:text="${brandingSupportUrl}" style="color:#4F8EF7;"></a>
  </p>
</div>
</body>
</html>
```

### MailService injection pattern

```java
context.setVariable("brandingName", applicationProperties.getBranding().getName());
context.setVariable("brandingSupportUrl", applicationProperties.getBranding().getSupportUrl());
```

## Data Models

### `BrandingProperties` (already exists in ApplicationProperties.java)
```java
name = "${APPLICATION_BRANDING_NAME:NilaChakra}"
nameShort = "${APPLICATION_BRANDING_NAME_SHORT:NC}"
supportUrl = "https://nilachakra.com/contact"
docsUrl = "https://docs.nilachakra.com"
```

## Correctness Properties

### Property 1: No UTMStack in Email Templates

**Validates: Requirements 1.3**

`grep -r 'UTMStack\|utmstack' backend/src/main/resources/templates/mail` → zero results.

### Property 2: Spring App Name Unchanged

**Validates: Requirements 2.2**

`grep 'spring.application.name' backend/src/main/resources/config/application.yml` → still `UTMStack-API`.

## Error Handling

If `brandingName` variable is missing from template context, Thymeleaf renders the fallback text "NilaChakra" from the `th:text` default value in the fragment.
