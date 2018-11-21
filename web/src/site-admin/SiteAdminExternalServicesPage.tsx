import { map } from 'lodash'
import * as React from 'react'
import { RouteComponentProps } from 'react-router'
import { Observable, Subject } from 'rxjs'
import { gql } from '../../../shared/src/graphql/graphql'
import * as GQL from '../../../shared/src/graphql/schema'
import { createAggregateError } from '../../../shared/src/util/errors'
import { queryGraphQL } from '../backend/graphql'
import { FilteredConnection, FilteredConnectionQueryArgs } from '../components/FilteredConnection'
import { PageTitle } from '../components/PageTitle'
import { eventLogger } from '../tracking/eventLogger'

interface ExternalServiceNodeProps {
    node: GQL.IExternalService
    onDidUpdate?: () => void
}

interface ExternalServiceNodeState {
    // loading: boolean
    // errorDescription?: string
}

class ExternalServiceNode extends React.PureComponent<ExternalServiceNodeProps, ExternalServiceNodeState> {
    public state: ExternalServiceNodeState = {
        // loading: false,
    }

    public render(): JSX.Element | null {
        return <li className="repository-node list-group-item py-2">{this.props.node.displayName}</li>
    }
}

interface Props extends RouteComponentProps<{}> {}
interface State {}

class FilteredExternalServiceConnection extends FilteredConnection<
    GQL.IExternalService,
    Pick<ExternalServiceNodeProps, 'onDidUpdate'>
> {}

/**
 * A page displaying the external services on this site.
 */
export class SiteAdminExternalServicesPage extends React.PureComponent<Props, State> {
    public state: State = {}

    private updates = new Subject<void>()

    public componentDidMount(): void {
        eventLogger.logViewEvent('SiteAdminExternalServices')
    }

    // public componentWillUnmount(): void {}

    public render(): JSX.Element | null {
        const nodeProps: Pick<ExternalServiceNodeProps, 'onDidUpdate'> = {
            onDidUpdate: this.onDidUpdateExternalServices,
        }

        return (
            <div className="site-admin-external-services-page">
                <PageTitle title="External Services - Admin" />
                <h2>External Services</h2>
                <p>Manage connections to external services.</p>
                <FilteredExternalServiceConnection
                    className="list-group list-group-flush mt-3"
                    noun="external service"
                    pluralNoun="external services"
                    queryConnection={this.queryExternalServices}
                    nodeComponent={ExternalServiceNode}
                    nodeComponentProps={nodeProps}
                    updates={this.updates}
                    history={this.props.history}
                    location={this.props.location}
                />
            </div>
        )
    }

    private queryExternalServices = (args: FilteredConnectionQueryArgs): Observable<GQL.IExternalServiceConnection> =>
        queryGraphQL(
            gql`
                query ExternalServices($first: Int) {
                    externalServices(first: $first) {
                        nodes {
                            displayName
                        }
                        totalCount
                        pageInfo {
                            hasNextPage
                        }
                    }
                }
            `,
            {
                first: args.first,
            }
        ).pipe(
            map(({ data, errors }) => {
                if (!data || !data.externalServices || errors) {
                    throw createAggregateError(errors)
                }
                return data.externalServices
            })
        )

    private onDidUpdateExternalServices = () => this.updates.next()
}
