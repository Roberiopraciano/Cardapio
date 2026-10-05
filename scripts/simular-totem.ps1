<#
  Simula o totem no fluxo "Pagar no totem", enquanto o totem Flutter não lê o QR.

  Uso (com o Laravel local rodando em http://127.0.0.1:8000):
    .\scripts\simular-totem.ps1 -Codigo 7AK3M            # lê o pedido e "paga"
    .\scripts\simular-totem.ps1 -Codigo 7AK3M -SoLer     # só lê (celular mostra "o totem abriu seu pedido")

  -Codigo aceita a contra-senha (7AK3M) ou o texto do QR (BERPTOTEM:...).
  O pedido já está em `orders` (status 2048, aguardando totem). "Pagar" faz ele
  virar status 1 com um pagamento Pix simulado e gera o evento para o PDV.
#>
param(
  [Parameter(Mandatory = $true)][string]$Codigo,
  [string]$Branch = '6aa8752b6191072796eaa4e3',
  [string]$Api = 'http://127.0.0.1:8000',
  [switch]$SoLer
)

$ErrorActionPreference = 'Stop'
$key = [uri]::EscapeDataString($Codigo.Trim())

function Show-Error($e) {
  $resp = $e.Exception.Response
  if ($resp) {
    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
    Write-Host ("HTTP {0}: {1}" -f [int]$resp.StatusCode, $reader.ReadToEnd()) -ForegroundColor Red
  } else { Write-Host $e.Exception.Message -ForegroundColor Red }
  exit 1
}

Write-Host "Totem lendo $Codigo ..." -ForegroundColor Cyan
try {
  $p = Invoke-RestMethod -Uri "$Api/api/totem-handoffs/$key`?branch=$Branch" -Headers @{ Accept = 'application/json' }
} catch { Show-Error $_ }

Write-Host ("Pedido {0} | cliente: {1} | {2} | prepaid: {3}" -f $p.code, $p.customer.name, $p.additionalInfo, $p.prepaid)
foreach ($i in $p.items) {
  Write-Host ("  {0}x {1}  R$ {2}" -f $i.quantity, $i.name, $i.price)
  foreach ($c in $i.complements) { Write-Host ("      + {0}x {1}  R$ {2}" -f $c.quantity, $c.name, $c.price) }
}
Write-Host ("Total: R$ {0}" -f $p.total) -ForegroundColor Yellow

if ($SoLer) { exit 0 }

Write-Host "Cobrando no TEF (simulado)..." -ForegroundColor Cyan
Start-Sleep -Seconds 2
try {
  $body = @{
    branch         = $Branch
    totemVersion   = 'simulador'
    installments   = 1
    paymentMethod  = @{ kind = 'Totem'; label = 'Pix'; prepaid = $true; data = @{ name = 'Pix'; active = $true; method = 'Pix' } }
    pinpadResponse = @{ CODRESP = '0'; NSU_SITEF = 'SIMULADO'; COMP_DADOS_CONF = 'Pagamento simulado' }
  } | ConvertTo-Json -Depth 5
  $r = Invoke-RestMethod -Method Post -Uri "$Api/api/totem-handoffs/$key/consume" `
    -ContentType 'application/json' -Headers @{ Accept = 'application/json' } -Body $body
} catch { Show-Error $_ }
Write-Host "Pago: pedido $($r._id) agora com status 1 (senha do painel: $($r.seqPanel))." -ForegroundColor Green
Write-Host "O celular deve mostrar 'Pagamento confirmado' em ate 4s." -ForegroundColor Green
