@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM ============================================================================
REM  FHVP Tech Varejo - Corrigir o endereco de atualizacao
REM
REM  Use isto quando o sistema disser "voce ja esta na versao mais recente"
REM  mesmo existindo uma versao mais nova.
REM
REM  O que acontece: dentro da pasta de instalacao existe um arquivo de texto
REM  (app-update.yml) que diz ONDE o sistema procura por atualizacao. Alguns
REM  computadores foram instalados com esse arquivo apontando para um endereco
REM  antigo, que nao recebe mais versao nova. O sistema entao pergunta no lugar
REM  errado, nao encontra nada mais novo e responde que esta atualizado - e,
REM  do ponto de vista dele, esta certo. Verificar de novo nao resolve.
REM
REM  Este script apenas reescreve esse arquivo apontando para o endereco atual.
REM  Nao mexe em dados, licenca nem backup. O arquivo antigo e guardado ao lado
REM  com a extensao .bak, caso precise voltar.
REM
REM  A pasta de instalacao NAO e fixa: muda conforme a versao em que o sistema
REM  foi instalado pela primeira vez (o nome do produto mudou ao longo do tempo)
REM  e conforme a instalacao ter sido so para este usuario ou para todos. Por
REM  isso o script procura em vez de adivinhar.
REM
REM  IMPORTANTE: FECHE O SISTEMA antes de rodar.
REM ============================================================================

set "N=0"

for %%R in ("%LOCALAPPDATA%\Programs" "%ProgramFiles%" "%ProgramFiles(x86)%") do (
  if exist "%%~R\" (
    for /d %%D in ("%%~R\*") do (
      if exist "%%~D\resources\app-update.yml" (
        REM Confirma pelo executavel que a pasta e do nosso sistema - outros
        REM aplicativos Electron instalados na maquina tambem tem esse arquivo,
        REM e reescrever o deles quebraria a atualizacao de um programa alheio.
        dir /b "%%~D\*.exe" 2>nul | findstr /i "FHVP Sistema" >nul && (
          set /a N+=1
          set "CAND!N!=%%~D"
        )
      )
    )
  )
)

if "%N%"=="0" (
  echo.
  echo  Nao encontrei o FHVP Tech Varejo instalado neste computador.
  echo.
  echo  Procurei nestas pastas:
  echo    %LOCALAPPDATA%\Programs
  echo    %ProgramFiles%
  echo    %ProgramFiles(x86^)%
  echo.
  echo  Se o sistema estiver instalado em outro lugar, abra a pasta dele,
  echo  entre em "resources", e edite o arquivo app-update.yml no Bloco de
  echo  Notas deixando exatamente estas tres linhas:
  echo.
  echo    provider: generic
  echo    url: https://updates.fhvptech.com/pro
  echo    updaterCacheDirName: sistema-rt-updater
  echo.
  echo  ^(troque "pro" por "basico" se este computador for do plano Basico^)
  echo.
  pause
  exit /b 1
)

set "ALVO=!CAND1!"

if not "%N%"=="1" (
  echo.
  echo  Encontrei mais de uma instalacao:
  echo.
  for /l %%I in (1,1,%N%) do echo    [%%I] !CAND%%I!
  echo.
  set /p "ESCOLHA=  Digite o numero da que voce quer corrigir: "
  for /l %%I in (1,1,%N%) do if "!ESCOLHA!"=="%%I" set "ALVO=!CAND%%I!"
)

set "DESTINO=!ALVO!\resources\app-update.yml"

echo.
echo  Instalacao: !ALVO!
echo.
echo  Endereco de atualizacao atual:
echo.
type "!DESTINO!"
echo.
echo  ---------------------------------------------------------------------
echo.
echo  Qual e o plano DESTE computador?
echo.
echo    [1] Basico
echo    [2] Pro   (tem Multicaixa e/ou Nota fiscal)
echo.
echo  Escolher errado faz o computador baixar a versao do plano errado na
echo  proxima atualizacao. Na duvida, pare aqui e confirme antes.
echo.

choice /c 12 /n /m "  Digite 1 ou 2: "
if errorlevel 2 (set "CANAL=pro") else (set "CANAL=basico")

echo.
echo  Canal escolhido: %CANAL%
echo.

if not exist "!DESTINO!.bak" copy /y "!DESTINO!" "!DESTINO!.bak" >nul

> "!DESTINO!" echo provider: generic
>>"!DESTINO!" echo url: https://updates.fhvptech.com/%CANAL%
>>"!DESTINO!" echo updaterCacheDirName: sistema-rt-updater

echo  Pronto. Novo endereco:
echo.
type "!DESTINO!"
echo.
echo  ---------------------------------------------------------------------
echo.
echo  Abra o sistema normalmente. Em alguns segundos ele encontra a versao
echo  nova e comeca a baixar sozinho.
echo.
echo  Depois desta atualizacao o problema nao volta: a versao nova ja vem com
echo  o endereco certo gravado.
echo.
pause
