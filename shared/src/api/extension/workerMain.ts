import { InitData, startExtensionHost } from './extensionHost'

/**
 * The entrypoint for the Web Worker that runs the extension host (and all extensions).
 *
 * To initialize the worker and start the extension host, the parent sends it an {@link InitData}
 * message.
 */
export function extensionHostWorkerMain(): void {
    self.addEventListener('message', receiveInitData)
    function receiveInitData(ev: MessageEvent): void {
        // The extension host is responsible for all subsequent communication.
        self.removeEventListener('message', receiveInitData)

        try {
            const initData: InitData = ev.data
            const unsubscribable = startExtensionHost(initData)
            self.addEventListener('unload', () => unsubscribable.unsubscribe())
        } catch (err) {
            console.error('Error starting the extension host:', err)
            self.close()
        }
    }
}
