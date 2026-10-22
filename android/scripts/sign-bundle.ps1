param(
    [Parameter(Mandatory = $true)][string]$JavaHome,
    [string]$UnsignedBundlePath,
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$taskAndroidRoot = Split-Path -Parent $PSScriptRoot
$taskRepoRoot = Split-Path -Parent $taskAndroidRoot
$taskReleaseConfig = Get-Content -LiteralPath (Join-Path $taskAndroidRoot 'release-config.json') -Raw | ConvertFrom-Json
if (-not $IsWindows) { throw 'This signing helper uses Windows DPAPI. Use Android Studio or a separately secured signing environment on other platforms.' }
if (-not $UnsignedBundlePath) { $UnsignedBundlePath = Join-Path $taskRepoRoot 'outputs/android-release/build/bundle/release/app-release.aab' }
if (-not $OutputPath) { $OutputPath = Join-Path $taskRepoRoot ('outputs/android-release/nextjob-' + $taskReleaseConfig.versionName + '-upload.aab') }
$taskUnsigned = [IO.Path]::GetFullPath($UnsignedBundlePath)
$taskSigned = [IO.Path]::GetFullPath($OutputPath)
if ($taskUnsigned -eq $taskSigned) { throw 'The signed output must not overwrite the unsigned bundle.' }
if (-not (Test-Path -LiteralPath $taskUnsigned -PathType Leaf)) { throw 'Unsigned Android bundle is missing.' }
$taskKeytool = Join-Path $JavaHome 'bin/keytool.exe'
$taskJarsigner = Join-Path $JavaHome 'bin/jarsigner.exe'
if (-not (Test-Path -LiteralPath $taskKeytool) -or -not (Test-Path -LiteralPath $taskJarsigner)) { throw 'JavaHome must contain a JDK with keytool and jarsigner.' }

$taskPrivate = Join-Path $taskAndroidRoot 'private'
New-Item -ItemType Directory -Path $taskPrivate -Force | Out-Null
# Only this Windows user and SYSTEM can read the local signing material.
$taskAcl = [Security.AccessControl.DirectorySecurity]::new()
$taskAcl.SetAccessRuleProtection($true, $false)
$taskCurrentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
foreach ($taskSid in @($taskCurrentSid, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
    $taskRule = [Security.AccessControl.FileSystemAccessRule]::new($taskSid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $taskAcl.AddAccessRule($taskRule)
}
Set-Acl -LiteralPath $taskPrivate -AclObject $taskAcl
$taskKeystore = Join-Path $taskPrivate 'upload-key.jks'
$taskProtectedPassword = Join-Path $taskPrivate 'upload-key.password.dpapi'
$taskAlias = 'nextjob-upload'
if ((Test-Path -LiteralPath $taskKeystore) -xor (Test-Path -LiteralPath $taskProtectedPassword)) {
    throw 'Signing material is incomplete. Restore the original key/password; this helper will not replace an existing key.'
}

$taskPassword = $null
try {
    if (Test-Path -LiteralPath $taskProtectedPassword) {
        $taskSecurePassword = Get-Content -LiteralPath $taskProtectedPassword -Raw | ConvertTo-SecureString
        $taskPassword = [Net.NetworkCredential]::new('', $taskSecurePassword).Password
    } else {
        $taskRandom = [byte[]]::new(32)
        [Security.Cryptography.RandomNumberGenerator]::Fill($taskRandom)
        $taskPassword = [Convert]::ToBase64String($taskRandom)
        $taskSecurePassword = ConvertTo-SecureString -String $taskPassword -AsPlainText -Force
        $taskSecurePassword | ConvertFrom-SecureString | Set-Content -LiteralPath $taskProtectedPassword -NoNewline
    }
    [Environment]::SetEnvironmentVariable('NEXTJOB_UPLOAD_STORE_PASSWORD', $taskPassword, 'Process')
    if (-not (Test-Path -LiteralPath $taskKeystore)) {
        & $taskKeytool -genkeypair -noprompt -keystore $taskKeystore -alias $taskAlias -storetype JKS -keyalg RSA -keysize 3072 -sigalg SHA256withRSA -validity 10000 -dname 'CN=NextJOB upload' -storepass:env NEXTJOB_UPLOAD_STORE_PASSWORD -keypass:env NEXTJOB_UPLOAD_STORE_PASSWORD
        if ($LASTEXITCODE -ne 0) { throw 'Upload key creation failed. Preserve any generated signing files for recovery.' }
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $taskSigned) -Force | Out-Null
    & $taskJarsigner -keystore $taskKeystore -storepass:env NEXTJOB_UPLOAD_STORE_PASSWORD -keypass:env NEXTJOB_UPLOAD_STORE_PASSWORD -sigalg SHA256withRSA -digestalg SHA-256 -signedjar $taskSigned $taskUnsigned $taskAlias
    if ($LASTEXITCODE -ne 0) { throw 'Android bundle signing failed.' }
    & $taskJarsigner -verify -strict -keystore $taskKeystore -storepass:env NEXTJOB_UPLOAD_STORE_PASSWORD $taskSigned
    if ($LASTEXITCODE -ne 0) { throw 'Signed Android bundle verification failed.' }
    $taskCertificate = Join-Path (Split-Path -Parent $taskSigned) 'upload-certificate.der'
    & $taskKeytool -exportcert -keystore $taskKeystore -alias $taskAlias -storepass:env NEXTJOB_UPLOAD_STORE_PASSWORD -file $taskCertificate
    if ($LASTEXITCODE -ne 0) { throw 'Public upload certificate export failed.' }
    $taskCertificateHash = (Get-FileHash -LiteralPath $taskCertificate -Algorithm SHA256).Hash
    $taskCertificateFingerprint = ([regex]::Matches($taskCertificateHash, '..').Value) -join ':'
    $taskReceipt = [ordered]@{
        applicationId = $taskReleaseConfig.applicationId
        versionName = $taskReleaseConfig.versionName
        versionCode = $taskReleaseConfig.versionCode
        signedBundle = $taskSigned
        bundleSha256 = (Get-FileHash -LiteralPath $taskSigned -Algorithm SHA256).Hash.ToLowerInvariant()
        uploadCertificateSha256 = $taskCertificateFingerprint
        signedAtUtc = [DateTime]::UtcNow.ToString('o')
        note = 'Upload certificate only. Website Digital Asset Links must use the separate Google Play app-signing certificate.'
    }
    $taskReceipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path (Split-Path -Parent $taskSigned) 'signing-receipt.json')
    $taskReceipt | ConvertTo-Json
} finally {
    [Environment]::SetEnvironmentVariable('NEXTJOB_UPLOAD_STORE_PASSWORD', $null, 'Process')
    $taskPassword = $null
    $taskSecurePassword = $null
}
