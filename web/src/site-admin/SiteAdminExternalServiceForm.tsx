import { LoadingSpinner } from '@sourcegraph/react-loading-spinner'
import * as H from 'history'
import * as React from 'react'
import { Markdown } from '../../../shared/src/components/Markdown'
import * as GQL from '../../../shared/src/graphql/schema'
import { ErrorLike } from '../../../shared/src/util/errors'
import { renderMarkdown } from '../../../shared/src/util/markdown'
import { Form } from '../components/Form'
import { DynamicallyImportedMonacoSettingsEditor } from '../settings/DynamicallyImportedMonacoSettingsEditor'
import { ExternalServiceKindMetadata } from './externalServices'

interface Props extends Pick<ExternalServiceKindMetadata, 'jsonSchema' | 'editorActions'> {
    history: H.History
    input: GQL.IAddExternalServiceInput
    isLightTheme: boolean
    error?: ErrorLike
    warning?: string
    mode: 'edit' | 'create'
    loading: boolean
    onSubmit: (event?: React.FormEvent<HTMLFormElement>) => void
    onChange: (change: GQL.IAddExternalServiceInput) => void
}

/**
 * Form for submitting a new or updated external service.
 */
export class SiteAdminExternalServiceForm extends React.Component<Props, {}> {
    public render(): JSX.Element | null {
        return (
            <Form className="external-service-form" onSubmit={this.props.onSubmit}>
                {this.props.error && (
                    <div className="alert alert-danger">
                        <p>Error saving configuration:</p>
                        <Markdown dangerousInnerHTML={renderMarkdown(this.props.error.message.replace(/\t/g, ''))} />
                    </div>
                )}
                {this.props.warning && (
                    <div className="alert alert-warning">
                        <h4>Warning</h4>
                        <Markdown dangerousInnerHTML={renderMarkdown(this.props.warning.replace(/\t/g, ''))} />
                    </div>
                )}
                <div className="form-group">
                    <label className="font-weight-bold" htmlFor="e2e-external-service-form-display-name">
                        Display name:
                    </label>
                    <input
                        id="e2e-external-service-form-display-name"
                        type="text"
                        className="form-control"
                        required={true}
                        autoCorrect="off"
                        autoComplete="off"
                        autoFocus={true}
                        spellCheck={false}
                        value={this.props.input.displayName}
                        onChange={this.onDisplayNameChange}
                        disabled={this.props.loading}
                    />
                </div>

                <div className="form-group">
                    <DynamicallyImportedMonacoSettingsEditor
                        // DynamicallyImportedMonacoSettingsEditor does not re-render the passed input.config
                        // if it thinks the config is dirty. We want to always replace the config if the kind changes
                        // so the editor is keyed on the kind.
                        value={this.props.input.config}
                        jsonSchema={this.props.jsonSchema}
                        canEdit={false}
                        loading={this.props.loading}
                        height={350}
                        isLightTheme={this.props.isLightTheme}
                        onChange={this.onConfigChange}
                        history={this.props.history}
                        actions={this.props.editorActions}
                    />
                    <p className="form-text text-muted">
                        <small>Use Ctrl+Space for completion, and hover over JSON properties for documentation.</small>
                    </p>
                </div>
                <button
                    type="submit"
                    className={`btn btn-primary ${
                        this.props.mode === 'create'
                            ? 'e2e-add-external-service-button'
                            : 'e2e-update-external-service-button'
                    }`}
                    disabled={this.props.loading}
                >
                    {this.props.loading && <LoadingSpinner className="icon-inline" />}
                    {this.props.mode === 'edit' ? 'Update external service' : 'Add external service'}
                </button>
            </Form>
        )
    }

    private onDisplayNameChange: React.ChangeEventHandler<HTMLInputElement> = event => {
        this.props.onChange({ ...this.props.input, displayName: event.currentTarget.value })
    }

    private onConfigChange = (config: string) => {
        this.props.onChange({ ...this.props.input, config })
    }
}
