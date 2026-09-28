import SwiftUI

@main
struct SoDMsApp: App {
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
