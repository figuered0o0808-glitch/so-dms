import SwiftUI
import AVFoundation

@main
struct SoDMsApp: App {
    init() {
        // Tocar E gravar: vídeos com som mesmo no silencioso, e o microfone liberado
        // para os áudios. (Só "tocar" deixava a gravação muda.)
        try? AVAudioSession.sharedInstance().setCategory(
            .playAndRecord, mode: .default,
            options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP, .allowAirPlay])
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
