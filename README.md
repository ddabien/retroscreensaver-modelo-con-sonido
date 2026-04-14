# SpaceInvadersSaver

Salvapantallas de macOS basado en tu animacion de Space Invaders.

## Que genera GitHub Actions

El workflow compila un bundle nativo de macOS:

- `SpaceInvadersSaver.saver`
- `SpaceInvadersSaver-macos.zip`

El archivo correcto para macOS es `.saver`. `\.scr` es de Windows.

## Como compilar en GitHub

1. Sube esta carpeta a un repositorio.
2. Abre la pestana `Actions`.
3. Ejecuta `Build macOS Screen Saver` o empuja un commit a `main`.
4. Cuando termine, descarga el artifact `SpaceInvadersSaver-macos`.
5. Descomprime el zip.

## Como instalar en macOS

1. Haz doble click en `SpaceInvadersSaver.saver`, o copialo a `~/Library/Screen Savers/`.
2. Abre `System Settings > Screen Saver`.
3. Selecciona `SpaceInvadersSaver`.

## Compatibilidad

- Deployment target: macOS 14 Sonoma o superior.
- El workflow compila en GitHub Actions sobre macOS 15.
- El bundle usa APIs compatibles con Sonoma en adelante.

## Estructura

- `SpaceInvadersSaver.xcodeproj`: proyecto Xcode para compilar el bundle `.saver`.
- `SpaceInvadersSaver/SpaceInvadersSaverView.swift`: wrapper nativo del screensaver.
- `SpaceInvadersSaver/Web/`: HTML, JS y assets del juego.
- `.github/workflows/build-saver.yml`: build automatizado en GitHub Actions.
