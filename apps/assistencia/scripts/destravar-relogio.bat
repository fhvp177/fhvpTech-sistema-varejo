@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM ============================================================================
REM  FHVP Tech Assistencia Tecnica - Destravar guardiao de relogio
REM
REM  Use isto quando, ao abrir, o sistema mostrar a mensagem:
REM     "Relogio do sistema parece incorreto..."
REM  E voce JA CONFIRMOU que a data/hora do Windows esta CORRETA.
REM
REM  O que acontece: existe uma trava anti-fraude que guarda, num arquivo
REM  (licenca.heartbeat), a ultima data em que o sistema rodou. Se o relogio
REM  do PC esteve no FUTURO em algum momento, esse arquivo ficou com uma data
REM  adiantada e a trava passa a achar que o relogio "voltou no tempo".
REM
REM  Este script apenas RENOMEIA esse arquivo (faz backup, nao apaga) na pasta
REM  de dados do app. Seus dados (database.sqlite) e sua licenca
REM  (licenca.lic) NAO sao tocados. Na proxima abertura o sistema recria o
REM  arquivo a partir do relogio (agora correto) e destrava.
REM
REM  IMPORTANTE:
REM   1) Confirme a data/hora do Windows ANTES (Configuracoes > Data e hora >
REM      "Definir horario automaticamente" ligado > Sincronizar agora).
REM   2) FECHE O SISTEMA antes de rodar este script.
REM ============================================================================

set "STAMP=%DATE:/=-%_%TIME::=-%"
set "STAMP=%STAMP: =0%"
set "ACHOU=0"

echo.
echo  Destravar guardiao de relogio - FHVP Tech Assistencia Tecnica
echo  --------------------------------------------------------------
echo.

for %%P in ("FHVP Tech Assistencia") do (
  set "HB=%APPDATA%\%%~P\licenca.heartbeat"
  if exist "!HB!" (
    ren "!HB!" "licenca.heartbeat.bkp-%STAMP%"
    echo    [OK] %%~P  ->  licenca.heartbeat renomeado para backup
    set "ACHOU=1"
  ) else (
    echo    [--] %%~P  ->  sem arquivo de relogio ^(nada a fazer aqui^)
  )
)

echo.
if "%ACHOU%"=="1" (
  echo  Pronto! Abra o sistema novamente.
  echo  Se a data/hora do Windows estiver correta, ele deve destravar.
  echo.
  echo  Ainda travou? Entao pode existir uma VENDA registrada com data no
  echo  futuro. Nesse caso entre em contato com o suporte para corrigir.
) else (
  echo  Nao encontrei o arquivo de relogio em nenhuma das pastas.
  echo  A causa pode ser outra - entre em contato com o suporte.
)
echo.
pause
