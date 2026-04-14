import ScreenSaver
import WebKit

final class SpaceInvadersSaverView: ScreenSaverView {
    private let webView: WKWebView

    override init?(frame: NSRect, isPreview: Bool) {
        let configuration = WKWebViewConfiguration()
        configuration.suppressesIncrementalRendering = false
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false

        self.webView = WKWebView(frame: frame, configuration: configuration)
        super.init(frame: frame, isPreview: isPreview)

        animationTimeInterval = 1.0 / 30.0
        wantsLayer = true
        layer?.backgroundColor = NSColor.black.cgColor

        setupWebView()
        loadContent(preview: isPreview)
    }

    required init?(coder: NSCoder) {
        let configuration = WKWebViewConfiguration()
        configuration.suppressesIncrementalRendering = false
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        self.webView = WKWebView(frame: .zero, configuration: configuration)
        super.init(coder: coder)

        animationTimeInterval = 1.0 / 30.0
        wantsLayer = true
        layer?.backgroundColor = NSColor.black.cgColor

        setupWebView()
        loadContent(preview: false)
    }

    override var hasConfigureSheet: Bool {
        false
    }

    override func animateOneFrame() {
        // El loop visual corre dentro del canvas via requestAnimationFrame.
    }

    override func startAnimation() {
        super.startAnimation()
        webView.evaluateJavaScript("window.__spaceInvaders?.resume?.()")
    }

    override func stopAnimation() {
        webView.evaluateJavaScript("window.__spaceInvaders?.pause?.()")
        super.stopAnimation()
    }

    private func setupWebView() {
        webView.setValue(false, forKey: "drawsBackground")
        webView.autoresizingMask = [.width, .height]
        webView.frame = bounds
        webView.scrollView.drawsBackground = false
        webView.scrollView.hasHorizontalScroller = false
        webView.scrollView.hasVerticalScroller = false

        addSubview(webView)
    }

    private func loadContent(preview: Bool) {
        guard
            let resourcesURL = Bundle(for: Self.self).resourceURL,
            let components = NSURLComponents(
                url: resourcesURL.appendingPathComponent("Web/index.html"),
                resolvingAgainstBaseURL: false
            )
        else {
            return
        }

        components.queryItems = [
            URLQueryItem(name: "preview", value: preview ? "1" : "0"),
            URLQueryItem(name: "sound", value: "0")
        ]

        guard
            let htmlURL = components.url,
            let accessURL = Bundle(for: Self.self).resourceURL?.appendingPathComponent("Web")
        else {
            return
        }

        webView.loadFileURL(htmlURL, allowingReadAccessTo: accessURL)
    }
}
