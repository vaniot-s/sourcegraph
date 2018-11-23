import { Subscription, Unsubscribable } from 'rxjs'
import * as sourcegraph from 'sourcegraph'
import { createProxy, handleRequests } from '../common/proxy'
import { SettingsCascade } from '../protocol'
import { Connection, createConnection, Logger, MessageTransports } from '../protocol/jsonrpc2/connection'
import { createWebWorkerMessageTransports } from '../protocol/jsonrpc2/transports/webWorker'
import { ExtCommands } from './api/commands'
import { ExtConfiguration } from './api/configuration'
import { ExtContext } from './api/context'
import { ExtDocuments } from './api/documents'
import { ExtLanguageFeatures } from './api/languageFeatures'
import { ExtRoots } from './api/roots'
import { ExtSearch } from './api/search'
import { ExtViews } from './api/views'
import { ExtWindows } from './api/windows'
import { Location } from './types/location'
import { Position } from './types/position'
import { Range } from './types/range'
import { Selection } from './types/selection'
import { URI } from './types/uri'

const consoleLogger: Logger = {
    error(message: string): void {
        console.error(message)
    },
    warn(message: string): void {
        console.warn(message)
    },
    info(message: string): void {
        console.info(message)
    },
    log(message: string): void {
        console.log(message)
    },
}

/**
 * Required information when initializing an extension host.
 */
export interface InitData {
    /** @see {@link module:sourcegraph.internal.sourcegraphURL} */
    sourcegraphURL: string

    /** @see {@link module:sourcegraph.internal.clientApplication} */
    clientApplication: 'sourcegraph' | 'other'

    /**
     * The settings cascade at the time of extension host initialization. It must be provided because extensions
     * expect that the settings are synchronously available when their `activate` method is called.
     */
    settingsCascade: SettingsCascade<any>
}

/**
 * Creates the extension host, which runs extensions. It is a Web Worker or other similar isolated
 * JavaScript execution context. There is exactly 1 extension host, and it has zero or more
 * extensions activated (and running).
 *
 * @param initData The information to initialize this extension host.
 * @param transports The message reader and writer to use for communication with the client.
 *                   Defaults to communicating using self.postMessage and MessageEvents with the
 *                   parent (assuming that it is called in a Web Worker).
 * @return An unsubscribable to terminate the extension host.
 */
export function startExtensionHost(
    initData: InitData,
    transports: MessageTransports = createWebWorkerMessageTransports()
): Unsubscribable {
    const connection = createConnection(transports, consoleLogger)
    connection.listen()

    const subscription = new Subscription()
    subscription.add(connection)

    // Make `import 'sourcegraph'` or `require('sourcegraph')` return the extension API.
    const api = createExtensionAPI(initData, connection)
    ;(self as any).require = (modulePath: string): any => {
        if (modulePath === 'sourcegraph') {
            return api
        }
        // All other requires/imports in the extension's code should not reach here because their JS
        // bundler should have resolved them locally.
        throw new Error(`require: module not found: ${modulePath}`)
    }

    // Activate extensions when requested.
    //
    // TODO(sqs): add timeouts to prevent long-running activate or deactivate functions from
    // significantly delaying other extensions.
    connection.onRequest('activateExtension', async (bundleURL: string) => {
        const { activation, deactivate } = activateExtension(bundleURL)
        try {
            await activation

            // Deactivate the extension when the extension host terminates. There is no guarantee that this
            // is called or that execution continues until it is finshed (i.e., the JavaScript execution
            // context may be terminated before deactivation is completed).
            subscription.add(deactivate)
        } catch (err) {
            // Deactivate the extension if an error was thrown, in case the extension was partially
            // activated and acquired resources that should be released. The deactivate function
            // might not be robust to being called when the extension was only partially activated,
            // which might mean that it would not release all of the resources that were acquired
            // (but it's still better than not running it at all).
            await deactivate()
            throw err
        }
    })

    return subscription
}

function createExtensionAPI(initData: InitData, connection: Connection): typeof sourcegraph {
    // For debugging/tests.
    const sync = () => connection.sendRequest<void>('ping')
    connection.onRequest('ping', () => 'pong')

    const context = new ExtContext(createProxy(connection, 'context'))
    handleRequests(connection, 'context', context)

    const documents = new ExtDocuments(sync)
    handleRequests(connection, 'documents', documents)

    const roots = new ExtRoots()
    handleRequests(connection, 'roots', roots)

    const windows = new ExtWindows(createProxy(connection, 'windows'), createProxy(connection, 'codeEditor'), documents)
    handleRequests(connection, 'windows', windows)

    const views = new ExtViews(createProxy(connection, 'views'))
    handleRequests(connection, 'views', views)

    const configuration = new ExtConfiguration<any>(createProxy(connection, 'configuration'), initData.settingsCascade)
    handleRequests(connection, 'configuration', configuration)

    const languageFeatures = new ExtLanguageFeatures(createProxy(connection, 'languageFeatures'), documents)
    handleRequests(connection, 'languageFeatures', languageFeatures)

    const search = new ExtSearch(createProxy(connection, 'search'))
    handleRequests(connection, 'search', search)

    const commands = new ExtCommands(createProxy(connection, 'commands'))
    handleRequests(connection, 'commands', commands)

    return {
        URI,
        Position,
        Range,
        Selection,
        Location,
        MarkupKind: {
            // The const enum MarkupKind values can't be used because then the `sourcegraph` module import at the
            // top of the file is emitted in the generated code. That is problematic because it hasn't been defined
            // yet (in workerMain.ts). It seems that using const enums should *not* emit an import in the generated
            // code; this is a known issue: https://github.com/Microsoft/TypeScript/issues/16671
            // https://github.com/palantir/tslint/issues/1798 https://github.com/Microsoft/TypeScript/issues/18644.
            PlainText: 'plaintext' as sourcegraph.MarkupKind.PlainText,
            Markdown: 'markdown' as sourcegraph.MarkupKind.Markdown,
        },

        app: {
            get activeWindow(): sourcegraph.Window | undefined {
                return windows.getActive()
            },
            get windows(): sourcegraph.Window[] {
                return windows.getAll()
            },
            createPanelView: id => views.createPanelView(id),
        },

        workspace: {
            get textDocuments(): sourcegraph.TextDocument[] {
                return documents.getAll()
            },
            onDidOpenTextDocument: documents.onDidOpenTextDocument,
            get roots(): ReadonlyArray<sourcegraph.WorkspaceRoot> {
                return roots.getAll()
            },
            onDidChangeRoots: roots.onDidChange,
        },

        configuration: {
            get: () => configuration.get(),
            subscribe: next => configuration.subscribe(next),
        },

        languages: {
            registerHoverProvider: (selector, provider) => languageFeatures.registerHoverProvider(selector, provider),
            registerDefinitionProvider: (selector, provider) =>
                languageFeatures.registerDefinitionProvider(selector, provider),
            registerTypeDefinitionProvider: (selector, provider) =>
                languageFeatures.registerTypeDefinitionProvider(selector, provider),
            registerImplementationProvider: (selector, provider) =>
                languageFeatures.registerImplementationProvider(selector, provider),
            registerReferenceProvider: (selector, provider) =>
                languageFeatures.registerReferenceProvider(selector, provider),
        },

        search: {
            registerQueryTransformer: provider => search.registerQueryTransformer(provider),
        },

        commands: {
            registerCommand: (command, callback) => commands.registerCommand({ command, callback }),
            executeCommand: (command, ...args) => commands.executeCommand(command, args),
        },

        internal: {
            sync,
            updateContext: updates => context.updateContext(updates),
            sourcegraphURL: new URI(initData.sourcegraphURL),
            clientApplication: initData.clientApplication,
        },
    }
}

/**
 * Loads an extension and invokes its `activate` function to start running it.
 *
 * It also sets up global hooks so that when the extension's code uses `require('sourcegraph')` and
 * `import 'sourcegraph'`, it gets the extension API handle (the value specified in
 * sourcegraph.d.ts).
 *
 * @param bundleURL The URL to the JavaScript source file (that exports an `activate` function) for
 * the extension.
 * @returns The extension's deactivate function (or a noop if it has none), and an activation
 * promise that resolves when activation finishes.
 * @throws An error if importScripts fails on the extension bundle.
 */
function activateExtension(
    bundleURL: string
): {
    activation: Promise<void>
    deactivate: () => Promise<void>
} {
    console.log(
        'TODO!(sqs): check origin, see https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage#Security_concerns'
    )
    console.log('TODO!(sqs)')
    console.log('TODO!(sqs)')
    console.log('TODO!(sqs)')
    console.log('TODO!(sqs)')
    console.log('TODO!(sqs)')
    console.log('TODO!(sqs)')
    console.log('TODO!(sqs)')

    // Load the extension bundle and retrieve the extension entrypoint module's exports on
    // the global `module` property.
    try {
        ;(self as any).exports = {}
        ;(self as any).module = {}
        ;(self as any).importScripts(bundleURL)
    } catch (error) {
        throw Object.assign(new Error('error executing extension bundle (in importScripts)'), { error })
    }
    const extensionExports = (self as any).module.exports
    delete (self as any).exports
    delete (self as any).module

    return {
        // Wrap in Promise constructor so that the behavior is consistent for both sync and async
        // activate functions that throw errors. Both cases should yield a rejected promise.
        activation: new Promise<void>((resolve, reject) => {
            if ('activate' in extensionExports) {
                // This will yield a rejected promise if activation throws or rejects.
                resolve(extensionExports.activate())
            } else {
                reject(new Error(`error activating extension: extension did not export an 'activate' function`))
            }
        }),
        deactivate: async () => {
            if ('deactivate' in extensionExports) {
                try {
                    await Promise.resolve(extensionExports.deactivate())
                } catch (err) {
                    console.warn(`Extension 'deactivate' function threw an error.`, err)
                }
            }
        },
    }
}
