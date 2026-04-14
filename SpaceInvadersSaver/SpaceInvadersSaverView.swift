import Cocoa
import ScreenSaver

final class SpaceInvadersSaverView: ScreenSaverView {
    private struct Bullet {
        var x: CGFloat
        var y: CGFloat
        var w: CGFloat
        var h: CGFloat
        var vy: CGFloat
    }

    private struct Invader {
        let col: Int
        let row: Int
        var alive: Bool
        var x: CGFloat
        var y: CGFloat
    }

    private struct ShieldCell {
        let dx: CGFloat
        let dy: CGFloat
        var alive: Bool
    }

    private struct Shield {
        let x: CGFloat
        let y: CGFloat
        var cells: [ShieldCell]
    }

    private struct UFO {
        var x: CGFloat
        var y: CGFloat
        var w: CGFloat
        var h: CGFloat
        var dir: CGFloat
    }

    private struct ExplosionState {
        var timer: TimeInterval = 0
    }

    private let baseSize = CGSize(width: 1024, height: 640)
    private let cols = 11
    private let rows = 5
    private let shieldShape = [
        "    #########    ",
        "   ###########   ",
        "  #############  ",
        " ############### ",
        " ############### ",
        " ############### ",
        " ######   ###### ",
        " #####     ##### ",
        " ####       #### ",
        " ###         ### "
    ]
    private let ufoShape = [
        "    #########    ",
        "   ###########   ",
        "  #############  ",
        " ############### ",
        " ############### ",
        " ############### ",
        "   ###   ###     "
    ]

    private var shipImage: NSImage?
    private var invaderAImage: NSImage?
    private var invaderBImage: NSImage?
    private var explosionImage: NSImage?

    private var shipX: CGFloat = 512
    private var shipY: CGFloat = 586
    private var playerDir: CGFloat = 1
    private var invaders: [Invader] = []
    private var invaderDirection: CGFloat = 1
    private var invaderSpeed: CGFloat = 26
    private var animationToggle = false
    private var animationElapsed: TimeInterval = 0
    private var edgeCooldown: TimeInterval = 0
    private var playerBullet: Bullet?
    private var playerCooldown: TimeInterval = 0
    private var alienBullets: [Bullet] = []
    private var alienCooldown: TimeInterval = 0.5
    private var shields: [Shield] = []
    private var ufo: UFO?
    private var ufoCooldown: TimeInterval = 12
    private var playerExplosion = ExplosionState()
    private var gameOver = false
    private var resetTimer: TimeInterval = 0

    private var invaderW: CGFloat = 18
    private var invaderH: CGFloat = 12
    private var shipW: CGFloat = 18
    private var shipH: CGFloat = 12
    private var gapX: CGFloat = 46
    private var gapY: CGFloat = 28
    private var stepDown: CGFloat = 16
    private var shieldBlock: CGFloat = 4

    override init?(frame: NSRect, isPreview: Bool) {
        super.init(frame: frame, isPreview: isPreview)
        animationTimeInterval = 1.0 / 30.0
        wantsLayer = true
        layer?.backgroundColor = NSColor.black.cgColor
        loadAssets()
        computeMetrics()
        resetGame()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        animationTimeInterval = 1.0 / 30.0
        wantsLayer = true
        layer?.backgroundColor = NSColor.black.cgColor
        loadAssets()
        computeMetrics()
        resetGame()
    }

    override var hasConfigureSheet: Bool {
        false
    }

    override func animateOneFrame() {
        update(delta: animationTimeInterval)
        needsDisplay = true
    }

    override func draw(_ rect: NSRect) {
        NSColor.black.setFill()
        rect.fill()

        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        NSGraphicsContext.current?.imageInterpolation = .none

        let scale = min(bounds.width / baseSize.width, bounds.height / baseSize.height)
        let drawWidth = baseSize.width * scale
        let drawHeight = baseSize.height * scale
        let offsetX = (bounds.width - drawWidth) / 2
        let offsetY = (bounds.height - drawHeight) / 2

        ctx.saveGState()
        ctx.translateBy(x: offsetX, y: offsetY)
        ctx.scaleBy(x: scale, y: scale)

        drawScene()

        ctx.restoreGState()
    }

    private func loadAssets() {
        shipImage = loadImage(named: "Ship")
        invaderAImage = loadImage(named: "InvaderA")
        invaderBImage = loadImage(named: "InvaderB")
        explosionImage = loadImage(named: "Explosion")
    }

    private func loadImage(named name: String) -> NSImage? {
        let bundle = Bundle(for: Self.self)
        if let url = bundle.resourceURL?.appendingPathComponent("Web/assets/\(name).gif") {
            return NSImage(contentsOf: url)
        }
        return nil
    }

    private func computeMetrics() {
        invaderW = max(8, (invaderAImage?.size.width ?? 24) * 0.38)
        invaderH = max(8, (invaderAImage?.size.height ?? 16) * 0.38)
        shipW = max(8, (shipImage?.size.width ?? 24) * 0.44)
        shipH = max(8, (shipImage?.size.height ?? 16) * 0.44)
        gapX = invaderW * 1.85
        gapY = invaderH * 1.6
        stepDown = max(14, invaderH * 1.05)
        shieldBlock = 4
        shipY = baseSize.height - 54
    }

    private func resetGame() {
        shipX = baseSize.width / 2
        playerDir = Bool.random() ? 1 : -1
        invaderDirection = 1
        invaderSpeed = 26
        animationToggle = false
        animationElapsed = 0
        edgeCooldown = 0
        playerBullet = nil
        playerCooldown = 0
        alienBullets = []
        alienCooldown = 0.5
        ufo = nil
        ufoCooldown = 10 + Double.random(in: 0 ... 8)
        playerExplosion = ExplosionState()
        gameOver = false
        resetTimer = 0
        rebuildInvaders()
        rebuildShields()
    }

    private func rebuildInvaders() {
        invaders.removeAll(keepingCapacity: true)
        let totalWidth = CGFloat(cols) * invaderW + CGFloat(cols - 1) * gapX
        let startX = (baseSize.width - totalWidth) / 2 + invaderW / 2
        let startY = max(90, baseSize.height * 0.18)

        for row in 0..<rows {
            for col in 0..<cols {
                invaders.append(
                    Invader(
                        col: col,
                        row: row,
                        alive: true,
                        x: startX + CGFloat(col) * (invaderW + gapX),
                        y: startY + CGFloat(row) * (invaderH + gapY)
                    )
                )
            }
        }
    }

    private func rebuildShields() {
        shields.removeAll(keepingCapacity: true)
        let count = 4
        let margin: CGFloat = 150
        let spacing = (baseSize.width - margin * 2) / CGFloat(count - 1)
        let baseY = baseSize.height - 138

        for index in 0..<count {
            var cells: [ShieldCell] = []
            for (row, line) in shieldShape.enumerated() {
                for (col, char) in line.enumerated() where char == "#" {
                    cells.append(
                        ShieldCell(
                            dx: (CGFloat(col) - CGFloat(line.count) / 2) * shieldBlock,
                            dy: (CGFloat(row) - CGFloat(shieldShape.count) / 2) * shieldBlock,
                            alive: true
                        )
                    )
                }
            }
            shields.append(Shield(x: margin + CGFloat(index) * spacing, y: baseY, cells: cells))
        }
    }

    private func update(delta: TimeInterval) {
        if gameOver {
            if playerExplosion.timer > 0 {
                playerExplosion.timer -= delta
            }
            resetTimer -= delta
            if resetTimer <= 0 {
                resetGame()
            }
            return
        }

        shipX += 85 * CGFloat(delta) * playerDir
        if shipX > baseSize.width - 30 {
            shipX = baseSize.width - 30
            playerDir = -1
        }
        if shipX < 30 {
            shipX = 30
            playerDir = 1
        }

        playerCooldown -= delta
        if playerBullet == nil, playerCooldown <= 0 {
            playerBullet = Bullet(x: shipX, y: shipY - 18, w: 5, h: 16, vy: -340)
            playerCooldown = 0.9 * Double.random(in: 0.8 ... 1.2)
        }

        if var bullet = playerBullet {
            bullet.y += bullet.vy * CGFloat(delta)
            playerBullet = bullet.y + bullet.h < 0 ? nil : bullet
        }

        animationElapsed += delta
        if animationElapsed > 0.35 {
            animationElapsed = 0
            animationToggle.toggle()
        }

        for index in invaders.indices where invaders[index].alive {
            invaders[index].x += invaderDirection * invaderSpeed * CGFloat(delta)
        }

        edgeCooldown -= delta
        handleInvaderEdges()

        alienCooldown -= delta
        if alienCooldown <= 0 {
            fireAlienBullet()
            alienCooldown = 1.1 * Double.random(in: 0.7 ... 1.3)
        }

        for index in alienBullets.indices {
            alienBullets[index].y += alienBullets[index].vy * CGFloat(delta)
        }
        alienBullets.removeAll { $0.y > baseSize.height + 20 }

        handleCollisions()
        updateUFO(delta: delta)

        if !invaders.contains(where: { $0.alive }) {
            gameOver = true
            resetTimer = 2
        }
    }

    private func handleInvaderEdges() {
        guard edgeCooldown <= 0 else { return }

        let alive = invaders.filter(\.alive)
        guard let minX = alive.map({ $0.x - invaderW / 2 }).min(),
              let maxX = alive.map({ $0.x + invaderW / 2 }).max() else { return }

        let margin: CGFloat = 24
        if minX < margin || maxX > baseSize.width - margin {
            invaderDirection *= -1
            let shift = minX < margin ? margin - minX : (baseSize.width - margin) - maxX
            for index in invaders.indices where invaders[index].alive {
                invaders[index].x += shift
                invaders[index].y += stepDown
            }
            invaderSpeed = min(invaderSpeed * 1.06, 160)
            edgeCooldown = 0.12
        }
    }

    private func fireAlienBullet() {
        var shuffledColumns = Array(0..<cols)
        shuffledColumns.shuffle()

        for col in shuffledColumns {
            if let shooter = invaders.filter({ $0.alive && $0.col == col }).max(by: { $0.row < $1.row }) {
                alienBullets.append(Bullet(x: shooter.x, y: shooter.y + 12, w: 5, h: 14, vy: 160))
                return
            }
        }
    }

    private func handleCollisions() {
        if let bullet = playerBullet {
            for index in invaders.indices where invaders[index].alive {
                let rect = CGRect(x: invaders[index].x - invaderW / 2, y: invaders[index].y - invaderH / 2, width: invaderW, height: invaderH)
                if rect.intersects(CGRect(x: bullet.x, y: bullet.y, width: bullet.w, height: bullet.h)) {
                    invaders[index].alive = false
                    playerBullet = nil
                    break
                }
            }
        }

        if let bullet = playerBullet, hitShield(with: bullet) {
            playerBullet = nil
        }

        alienBullets.removeAll { hitShield(with: $0) }

        let shipRect = CGRect(x: shipX - shipW / 2, y: shipY - shipH / 2, width: shipW, height: shipH)
        for bullet in alienBullets where shipRect.intersects(CGRect(x: bullet.x, y: bullet.y, width: bullet.w, height: bullet.h)) {
            playerExplosion.timer = 0.7
            gameOver = true
            resetTimer = 2
            break
        }
    }

    private func hitShield(with bullet: Bullet) -> Bool {
        let bulletRect = CGRect(x: bullet.x, y: bullet.y, width: bullet.w, height: bullet.h)
        for shieldIndex in shields.indices {
            for cellIndex in shields[shieldIndex].cells.indices where shields[shieldIndex].cells[cellIndex].alive {
                let cell = shields[shieldIndex].cells[cellIndex]
                let rect = CGRect(
                    x: shields[shieldIndex].x + cell.dx,
                    y: shields[shieldIndex].y + cell.dy,
                    width: shieldBlock,
                    height: shieldBlock
                )
                if rect.intersects(bulletRect) {
                    shields[shieldIndex].cells[cellIndex].alive = false
                    return true
                }
            }
        }
        return false
    }

    private func updateUFO(delta: TimeInterval) {
        if var activeUFO = ufo {
            activeUFO.x += activeUFO.dir * 140 * CGFloat(delta)
            if let bullet = playerBullet {
                let rect = CGRect(x: activeUFO.x - activeUFO.w / 2, y: activeUFO.y - activeUFO.h / 2, width: activeUFO.w, height: activeUFO.h)
                if rect.intersects(CGRect(x: bullet.x, y: bullet.y, width: bullet.w, height: bullet.h)) {
                    playerBullet = nil
                    ufo = nil
                    ufoCooldown = 10 + Double.random(in: 0 ... 8)
                    return
                }
            }
            if activeUFO.x < -activeUFO.w || activeUFO.x > baseSize.width + activeUFO.w {
                ufo = nil
                ufoCooldown = 10 + Double.random(in: 0 ... 8)
            } else {
                ufo = activeUFO
            }
        } else {
            ufoCooldown -= delta
            if ufoCooldown <= 0 {
                let width = CGFloat(ufoShape[0].count) * 4
                let height = CGFloat(ufoShape.count) * 4
                let dir: CGFloat = Bool.random() ? 1 : -1
                let startX = dir > 0 ? -width : baseSize.width + width
                ufo = UFO(x: startX, y: 70, w: width, h: height, dir: dir)
            }
        }
    }

    private func drawScene() {
        NSColor.black.setFill()
        CGRect(origin: .zero, size: baseSize).fill()

        drawShields()
        drawUFO()
        drawInvaders()
        drawShip()
        drawBullets()
        drawScanlines()
    }

    private func drawShields() {
        NSColor(calibratedRed: 0.24, green: 0.82, blue: 0.24, alpha: 1).setFill()
        for shield in shields {
            for cell in shield.cells where cell.alive {
                CGRect(x: shield.x + cell.dx, y: shield.y + cell.dy, width: shieldBlock, height: shieldBlock).fill()
            }
        }
    }

    private func drawUFO() {
        guard let ufo else { return }
        NSColor.magenta.setFill()
        let startX = round(ufo.x - ufo.w / 2)
        let startY = round(ufo.y - ufo.h / 2)
        for (row, line) in ufoShape.enumerated() {
            for (col, char) in line.enumerated() where char == "#" {
                CGRect(x: startX + CGFloat(col) * 4, y: startY + CGFloat(row) * 4, width: 4, height: 4).fill()
            }
        }
    }

    private func drawInvaders() {
        let image = animationToggle ? invaderBImage : invaderAImage
        for invader in invaders where invader.alive {
            let rect = CGRect(x: round(invader.x - invaderW / 2), y: round(invader.y - invaderH / 2), width: invaderW, height: invaderH)
            if let image {
                image.draw(in: rect)
            } else {
                NSColor.white.setFill()
                rect.fill()
            }
        }
    }

    private func drawShip() {
        if playerExplosion.timer > 0, let explosionImage {
            let rect = CGRect(x: round(shipX - shipW * 0.6), y: round(shipY - shipH * 0.6), width: shipW * 1.2, height: shipH * 1.2)
            explosionImage.draw(in: rect)
            return
        }

        let rect = CGRect(x: round(shipX - shipW / 2), y: round(shipY - shipH / 2), width: shipW, height: shipH)
        if let shipImage {
            shipImage.draw(in: rect)
        } else {
            NSColor.white.setFill()
            rect.fill()
        }
    }

    private func drawBullets() {
        NSColor.white.setFill()
        if let bullet = playerBullet {
            CGRect(x: round(bullet.x), y: round(bullet.y), width: bullet.w, height: bullet.h).fill()
        }
        for bullet in alienBullets {
            CGRect(x: round(bullet.x), y: round(bullet.y), width: bullet.w, height: bullet.h).fill()
        }
    }

    private func drawScanlines() {
        NSColor(white: 0, alpha: 0.06).setFill()
        stride(from: CGFloat(0), to: baseSize.height, by: 4).forEach { y in
            CGRect(x: 0, y: y, width: baseSize.width, height: 1).fill()
        }
    }
}

