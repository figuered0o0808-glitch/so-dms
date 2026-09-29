import UIKit
import WebKit
import SafariServices
import AVFoundation

final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {

    private let inbox = URL(string: "https://www.instagram.com/direct/inbox/")!
    private var webView: WKWebView!
    private let uaComputador = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15"
    private var modoComputador: Bool {
        get { UserDefaults.standard.bool(forKey: "modoComputador") }
        set { UserDefaults.standard.set(newValue, forKey: "modoComputador") }
    }
    private let faixaTopo = UIView()   // área do relógio, pintada com a cor do Instagram

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()               // mantém o login salvo
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        // Se identifica como o Safari do iPhone, para o Instagram mostrar a versão web normal
        config.applicationNameForUserAgent = "Version/18.6 Mobile/15E148 Safari/604.1"

        if let url = Bundle.main.url(forResource: "so-dms.user", withExtension: "js"),
           let source = try? String(contentsOf: url, encoding: .utf8) {
            let script = WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
            config.userContentController.addUserScript(script)
        }

        config.userContentController.add(self, name: "cores")
        config.userContentController.add(self, name: "vibrar")
        config.userContentController.add(self, name: "opcoes")

        webView = WKWebView(frame: .zero, configuration: config)
        if modoComputador { webView.customUserAgent = uaComputador }
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true   // arrastar da borda para voltar
        webView.allowsLinkPreview = false
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        webView.scrollView.backgroundColor = .systemBackground
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        faixaTopo.backgroundColor = .systemBackground
        faixaTopo.translatesAutoresizingMaskIntoConstraints = false
        view.insertSubview(faixaTopo, belowSubview: webView)

        let guide = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            faixaTopo.topAnchor.constraint(equalTo: view.topAnchor),
            faixaTopo.bottomAnchor.constraint(equalTo: guide.topAnchor),
            faixaTopo.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            faixaTopo.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: guide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: guide.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        webView.load(URLRequest(url: inbox))
    }

    // MARK: - Quais endereços abrem aqui dentro

    private func isInstagram(_ host: String) -> Bool {
        let permitidos = ["instagram.com", "cdninstagram.com", "facebook.com", "fbcdn.net",
                          "facebook.net", "accountscenter.meta.com", "meta.com"]
        return permitidos.contains { host == $0 || host.hasSuffix("." + $0) }
    }

    private func abrirFora(_ url: URL) {
        guard let scheme = url.scheme?.lowercased() else { return }
        if scheme == "http" || scheme == "https" {
            let safari = SFSafariViewController(url: url)
            present(safari, animated: true)
        } else if scheme == "mailto" || scheme == "tel" || scheme == "sms" {
            UIApplication.shared.open(url)
        }
    }

    /// Links externos do Instagram passam por l.instagram.com/?u=<destino>
    private func destinoReal(_ url: URL) -> URL? {
        guard let host = url.host?.lowercased(), host == "l.instagram.com",
              let comps = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let u = comps.queryItems?.first(where: { $0.name == "u" })?.value else { return nil }
        return URL(string: u)
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        let scheme = url.scheme?.lowercased() ?? ""
        let host = url.host?.lowercased() ?? ""

        // Nada de abrir o app do Instagram nem a App Store
        if scheme == "instagram" || scheme == "itms-apps" || scheme == "itms-appss"
            || host.hasSuffix("apps.apple.com") || host.hasSuffix("itunes.apple.com") {
            return decisionHandler(.cancel)
        }

        if ["about", "blob", "data", "javascript"].contains(scheme) {
            return decisionHandler(.allow)
        }

        let ehPrincipal = action.targetFrame?.isMainFrame ?? true
        if !ehPrincipal { return decisionHandler(.allow) }   // iframes internos

        if let destino = destinoReal(url) {
            abrirFora(destino)
            return decisionHandler(.cancel)
        }

        if scheme == "http" || scheme == "https" {
            if isInstagram(host) { return decisionHandler(.allow) }
            abrirFora(url)                                    // sites externos abrem numa janela à parte
            return decisionHandler(.cancel)
        }

        abrirFora(url)
        decisionHandler(.cancel)
    }

    // Links com target=_blank
    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            if let destino = destinoReal(url) {
                abrirFora(destino)
            } else if isInstagram(url.host?.lowercased() ?? "") {
                webView.load(action.request)
            } else {
                abrirFora(url)
            }
        }
        return nil
    }

    // Câmera e microfone (áudios, fotos)
    func webView(_ webView: WKWebView,
                 requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        guard origin.host.hasSuffix("instagram.com") else { return decisionHandler(.prompt) }
        // garante a permissão do iPhone para o microfone antes de liberar para o site
        AVAudioSession.sharedInstance().requestRecordPermission { ok in
            DispatchQueue.main.async {
                try? AVAudioSession.sharedInstance().setActive(true)
                decisionHandler(ok ? .grant : .deny)
                if !ok { self.avisarMicrofone() }
            }
        }
    }

    // Caixas de alerta/confirmação do site
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancelar", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    // MARK: - Cores das bordas (sem faixas pretas em cima e embaixo)

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "opcoes" {
            mostrarOpcoes()
            return
        }
        if message.name == "vibrar" {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            return
        }
        guard message.name == "cores", let dict = message.body as? [String: Any] else { return }
        if let topo = dict["topo"] as? String, let cor = Self.cor(css: topo) { faixaTopo.backgroundColor = cor }
        if let base = dict["base"] as? String, let cor = Self.cor(css: base) {
            view.backgroundColor = cor
            webView.backgroundColor = cor
            webView.scrollView.backgroundColor = cor
        }
    }

    /// Converte "rgb(12, 16, 20)" ou "rgba(12, 16, 20, 1)" em UIColor
    static func cor(css: String) -> UIColor? {
        let nums = css.components(separatedBy: CharacterSet(charactersIn: "0123456789.").inverted)
            .compactMap { Double($0) }
        guard nums.count >= 3 else { return nil }
        let alpha = nums.count >= 4 ? nums[3] : 1
        guard alpha > 0.5 else { return nil }
        return UIColor(red: nums[0] / 255, green: nums[1] / 255, blue: nums[2] / 255, alpha: 1)
    }

    // MARK: - Diagnóstico (chacoalhar o celular)

    override var canBecomeFirstResponder: Bool { true }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        becomeFirstResponder()
    }

    override func motionEnded(_ motion: UIEvent.EventSubtype, with event: UIEvent?) {
        guard motion == .motionShake else { return }
        mostrarOpcoes()
    }

    private func mostrarOpcoes() {
        let atual = modoComputador ? "computador" : "celular"
        let alerta = UIAlertController(title: "Opções do app",
                                       message: "Versão do Instagram em uso: \(atual).",
                                       preferredStyle: .actionSheet)
        alerta.addAction(UIAlertAction(title: modoComputador ? "Usar versão de celular" : "Usar versão de computador",
                                       style: .default) { [weak self] _ in self?.alternarModo() })
        alerta.addAction(UIAlertAction(title: "Gerar diagnóstico", style: .default) { [weak self] _ in self?.gerarDiagnostico() })
        alerta.addAction(UIAlertAction(title: "Cancelar", style: .cancel))
        alerta.popoverPresentationController?.sourceView = view
        present(alerta, animated: true)
    }

    private func alternarModo() {
        modoComputador.toggle()
        webView.customUserAgent = modoComputador ? uaComputador : nil
        webView.load(URLRequest(url: inbox))
    }

    private func gerarDiagnostico() {
        webView.evaluateJavaScript("window.__soDMsDiagnostico ? window.__soDMsDiagnostico() : 'script não carregado'") { [weak self] result, error in
            guard let self = self else { return }
            let texto = (result as? String) ?? "erro: \(error?.localizedDescription ?? "?")"
            let arquivo = FileManager.default.temporaryDirectory.appendingPathComponent("diagnostico-dms.txt")
            try? texto.write(to: arquivo, atomically: true, encoding: .utf8)
            let share = UIActivityViewController(activityItems: [arquivo], applicationActivities: nil)
            share.popoverPresentationController?.sourceView = self.view
            self.present(share, animated: true)
        }
    }

    private func avisarMicrofone() {
        let a = UIAlertController(title: "Microfone bloqueado",
                                  message: "Para gravar áudios, libere o microfone em Ajustes > DMs > Microfone.",
                                  preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "Abrir Ajustes", style: .default) { _ in
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
        })
        a.addAction(UIAlertAction(title: "OK", style: .cancel))
        present(a, animated: true)
    }

    // MARK: - Erros

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        mostrarErro(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        mostrarErro(error)
    }

    private func mostrarErro(_ error: Error) {
        let e = error as NSError
        // cancelamentos são normais (links bloqueados, redirecionamentos)
        if e.code == NSURLErrorCancelled || e.domain == "WebKitErrorDomain" { return }
        let html = """
        <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>body{font-family:-apple-system;display:flex;flex-direction:column;align-items:center;
        justify-content:center;height:90vh;color:#888;text-align:center}
        @media(prefers-color-scheme:dark){body{background:#000}}
        a{margin-top:16px;padding:12px 24px;border-radius:12px;background:#0095f6;color:#fff;text-decoration:none;font-weight:600}</style></head>
        <body><div>Sem conexão com o Instagram.</div><a href="\(inbox.absoluteString)">Tentar de novo</a></body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }
}
