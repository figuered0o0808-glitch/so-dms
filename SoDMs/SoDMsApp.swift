import SwiftUI
import AVFoundation

@main
struct SoDMsApp: App {
    init() {
        // vídeos com som mesmo com a chave do iPhone no silencioso
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
    }

    var body: some Scene {
        WindowGroup {
            InstagramView()
                .ignoresSafeArea()
        }
    }
}

struct InstagramView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> WebViewController { WebViewController() }
    func updateUIViewController(_ controller: WebViewController, context: Context) {}
}
