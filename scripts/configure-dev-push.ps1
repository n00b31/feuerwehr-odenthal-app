$ErrorActionPreference = 'Stop'
$project = 'orxinqhhbtjpkzwlfaxq'
$names = @('FF_VAPID_PUBLIC_KEY','FF_VAPID_PRIVATE_KEY','FF_PUSH_CRON_SECRET')
$existingJson = & npx.cmd --yes supabase@2.122.1 secrets list --project-ref $project --output json 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Supabase DEV secret inventory failed. Check CLI authentication; no secret values were printed.' }
$existing = @($existingJson | ConvertFrom-Json | ForEach-Object { $_.name })
$present = @($names | Where-Object { $existing -contains $_ })
if ($present.Count -eq 3) {
  Write-Output 'All three DEV Push secrets already exist. Reusing them without rotation.'
  return
}
if ($present.Count -ne 0) { throw 'Partial existing Push configuration. Stop and inspect; existing keys will not be overwritten.' }

$directory = Join-Path ([System.IO.Path]::GetTempPath()) ('ff-dev-push-' + [guid]::NewGuid().ToString('N'))
$file = Join-Path $directory 'push.env'
try {
  New-Item -ItemType Directory -Path $directory | Out-Null
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl = New-Object System.Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true,$false)
  $acl.SetOwner($identity)
  $inherit = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($identity,[System.Security.AccessControl.FileSystemRights]::FullControl,
    $inherit,[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow)
  $acl.AddAccessRule($rule)
  Set-Acl -LiteralPath $directory -AclObject $acl
  $generator = @'
const {generateKeyPairSync,randomBytes}=require('node:crypto');
const {writeFileSync}=require('node:fs');
const {privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const key=privateKey.export({format:'jwk'});
const publicKey=Buffer.concat([Buffer.from([4]),Buffer.from(key.x,'base64url'),Buffer.from(key.y,'base64url')]).toString('base64url');
writeFileSync(process.argv[1],`FF_VAPID_PUBLIC_KEY=${publicKey}\nFF_VAPID_PRIVATE_KEY=${key.d}\nFF_PUSH_CRON_SECRET=${randomBytes(32).toString('base64url')}\n`,{flag:'wx',mode:0o600});
'@
  $generated = & node -e $generator $file 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'Protected ephemeral key generation failed; no key values printed.' }
  $uploaded = & npx.cmd --yes supabase@2.122.1 secrets set --project-ref $project --env-file $file 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'DEV secret upload failed; no secret-bearing CLI output printed. Inspect inventory before retrying.' }
  Write-Output 'Three new server-only DEV Push secrets uploaded. No existing keys overwritten.'
} finally {
  if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force }
  if (Test-Path -LiteralPath $directory) { [System.IO.Directory]::Delete($directory) }
}
