# SpaceInvadersSaver

Proyecto minimo de salvapantallas nativo para macOS.

## Resultado

GitHub Actions genera:

- `SpaceInvadersSaver.saver`
- `SpaceInvadersSaver-macos.zip`

En macOS el formato correcto es `.saver`.

## Compatibilidad

- macOS 12 Monterey o superior
- pensado para Monterey, Ventura, Sonoma, Sequoia y Tahoe

## Archivos importantes

- `.github/workflows/build-saver.yml`
- `SpaceInvadersSaver.xcodeproj/project.pbxproj`
- `SpaceInvadersSaver/Info.plist`
- `SpaceInvadersSaver/SpaceInvadersSaverView.swift`

## Uso

1. Sube esta carpeta a GitHub.
2. Ejecuta el workflow `Build macOS Screen Saver`.
3. Descarga el artifact.
4. Instala `SpaceInvadersSaver.saver`.
