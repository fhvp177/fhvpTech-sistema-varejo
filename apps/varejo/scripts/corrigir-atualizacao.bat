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
REM  do ponto de vista dele, esta certo.
REM
REM  Este script apenas reescreve esse arquivo apontando para o endereco atual.
REM  Nao mexe em dados, licenca, backup nem em nada mais. O arquivo antigo e
REM  guardado ao lado, com a extensao .bak, caso precise voltar.
REM
REM  IMPORTANTE: FECHE O SISTEMA antes de rodar.
REM ============================================================================

set "DESTINO=%LOCALAPPDATA%\Programs\FHVP Tech Varejo\resources\app-update.yml"

if not exist "%DESTINO%" (
  echo.
  echo  Nao encontrei a instalacao do FHVP Tech Varejo neste computador.
  echo  Procurei em:
  echo    %DESTINO%
  echo.
  pause
  exit /b 1
)

echo.
echo  Endereco de atualizacao atual:
echo.
type "%DESTINO%"
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

REM Guarda o original antes de mexer.
if not exist "%DESTINO%.bak" copy /y "%DESTINO%" "%DESTINO%.bak" >nul

> "%DESTINO%" echo provider: generic
>>"%DESTINO%" echo url: https://updates.fhvptech.com/%CANAL%
>>"%DESTINO%" echo updaterCacheDirName: sistema-rt-updater

echo  Pronto. Novo endereco:
echo.
type "%DESTINO%"
echo.
echo  ---------------------------------------------------------------------
echo.
echo  Abra o sistema normalmente. Em alguns segundos ele encontra a versao
echo  nova e comeca a baixar sozinho. Se preferir, va em Configuracoes e use
echo  o botao de verificar atualizacao.
echo.
echo  Depois desta atualizacao o problema nao volta: a versao nova ja vem com
echo  o endereco certo gravado.
echo.
pause
