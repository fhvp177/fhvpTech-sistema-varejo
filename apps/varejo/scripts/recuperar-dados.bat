@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM ============================================================================
REM  FHVP Tech Varejo - Recuperacao de dados apos atualizacao
REM
REM  Use isto quando, depois de atualizar, o sistema abrir "do zero" (pedindo
REM  licenca/senha). Os dados nao foram perdidos: ficaram na pasta antiga
REM  (sistema-rt) e o sistema passou a abrir a pasta nova (Sistema RT), vazia.
REM  Este script copia os dados da pasta antiga para a nova, fazendo backup do
REM  que existir (nada e apagado).
REM
REM  IMPORTANTE: FECHE O SISTEMA antes de rodar.
REM ============================================================================

set "ORIGEM=%APPDATA%\sistema-rt"
set "DESTINO=%APPDATA%\Sistema RT"
set "STAMP=%DATE:/=-%_%TIME::=-%"
set "STAMP=%STAMP: =0%"

echo.
echo  Recuperacao de dados - FHVP Tech Varejo
echo  ---------------------------------------
echo  Antiga (origem):  %ORIGEM%
echo  Atual  (destino): %DESTINO%
echo.

if not exist "%ORIGEM%\database.sqlite" (
  echo  [!] Nao encontrei dados antigos em "%ORIGEM%".
  echo      Talvez a pasta antiga tenha outro nome. Nada foi alterado.
  echo.
  pause
  exit /b 1
)

if not exist "%DESTINO%" mkdir "%DESTINO%"

echo  Fazendo backup do conteudo atual da pasta destino (se houver)...
for %%F in (database.sqlite licenca.lic licenca.heartbeat) do (
  if exist "%DESTINO%\%%F" (
    ren "%DESTINO%\%%F" "%%F.bkp-%STAMP%"
    echo    - %%F  ->  %%F.bkp-%STAMP%
  )
)

echo.
echo  Copiando seus dados da pasta antiga para a atual...
copy /Y "%ORIGEM%\database.sqlite" "%DESTINO%\database.sqlite" >nul && echo    - database.sqlite  OK
if exist "%ORIGEM%\licenca.lic"       copy /Y "%ORIGEM%\licenca.lic"       "%DESTINO%\licenca.lic"       >nul && echo    - licenca.lic       OK
if exist "%ORIGEM%\licenca.heartbeat" copy /Y "%ORIGEM%\licenca.heartbeat" "%DESTINO%\licenca.heartbeat" >nul && echo    - licenca.heartbeat OK

echo.
echo  Pronto! Abra o sistema novamente - seus dados devem estar de volta.
echo  (Os arquivos .bkp-... sao o estado anterior, caso precise desfazer.)
echo.
pause
