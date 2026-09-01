# Security Policy

## Reporting

Do not open public issues for suspected vulnerabilities or exposed credentials. Use GitHub's private vulnerability reporting for `neviah/NexusIDE`. Include affected version, reproduction steps, impact, and any known workaround without including live secrets.

## Release Security Gate

A public beta is blocked by any critical unresolved security finding, invalid Authenticode signature, missing provenance, paid-route bypass, workspace containment failure, secret leakage, or non-reproducible rollback.

CI performs dependency review, package audits, Gitleaks scanning, deterministic provider/harness security tests, artifact hash validation, and a non-admin installer lifecycle test. Agent writes remain workspace-contained, edits and commands require approval, destructive operations are denied, and credentials remain in VS Code SecretStorage.

Support bundles are user-initiated and contain operational metadata only. They recursively redact credential, token, authorization, cookie, password, prompt, and secret fields and do not collect conversation text or workspace file contents.

## Supported Versions

Only the newest published beta or stable release receives security fixes. Alpha builds are development artifacts and are not supported for public deployment.