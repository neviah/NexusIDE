# Release Channels And Rollback

## Channels

- `alpha`: unsigned development and private testing artifacts. Tags use `v<version>-alpha.<number>`.
- `beta`: signed public test artifacts. Tags use `v<version>-beta.<number>`.
- `stable`: signed promoted artifacts. Tags use `v<version>-stable.<number>`.

The release manifest records `schemaVersion`, channel, NexusIDE commit, upstream commit, signing state, provenance type, artifact sizes, and SHA-256 hashes. Beta and stable packaging fail unless Authenticode signing succeeds.

## Signing Setup

Store the base64-encoded PFX as the `NEXUSIDE_SIGNING_CERTIFICATE_BASE64` GitHub Actions secret and its password as `NEXUSIDE_SIGNING_CERTIFICATE_PASSWORD`. The certificate private key must be exportable for CI, issued by a Windows-trusted code-signing authority, and protected according to the issuer's requirements.

Local release rehearsal:

```powershell
./scripts/build-portable.ps1 -Channel beta -SigningCertificatePath C:\secure\nexuside.pfx -SigningCertificatePassword $env:NEXUSIDE_SIGNING_CERTIFICATE_PASSWORD
./scripts/test-phase8-artifacts.ps1
```

GitHub Actions adds an OIDC-backed build provenance attestation to each release asset. Verify a downloaded asset with GitHub CLI:

```powershell
gh attestation verify .\NexusIDEUserSetup-x64-1.136.0.exe --repo neviah/NexusIDE
```

## Promotion And Rollback

1. Run CI and the public beta test matrix against the exact commit.
2. Create and push the matching annotated channel tag.
3. Verify Authenticode, SHA-256 metadata, and GitHub provenance after download.
4. Promote by rebuilding from the same commit for the target channel; never rename an alpha artifact into beta or stable.
5. If a release regresses, mark it as withdrawn, point users to the last verified release, and publish a new patch tag. Do not replace assets under an existing tag.

Pinokio keeps one prior checksum-verified application tree in `app.previous`. Its Roll Back action swaps that tree with the current installation without downloading files. Repair downloads the current release again; Reset removes both slots.