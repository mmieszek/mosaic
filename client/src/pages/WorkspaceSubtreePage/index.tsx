import gql from "graphql-tag";
import { compose } from "recompose";
import { graphql } from "react-apollo";
import { BlockHoverMenu } from "../../components/BlockHoverMenu";
import * as React from "react";
import _ = require("lodash");
import { WorkspaceCard } from "../../components/WorkspaceCard";

const WORKSPACES_QUERY = gql`
query workspaceSubtree($workspaceId: String!){
    subtreeWorkspaces(workspaceId:$workspaceId){
       id
       childWorkspaceOrder
       connectedPointers
       blocks{
         id
         value
         type
       }
     }
  }
`;

export class WorkspaceSubtreePagePresentational extends React.Component<any, any> {
    public render() {
        const workspaces = _.get(this.props, "workspaceSubtreeWorkspaces.subtreeWorkspaces") || [];
        const availablePointers = _.flatten(workspaces.map((w) => w.connectedPointers));
        const rootWorkspace = workspaces.find((w) => w.id === this.props.match.params.workspaceId);
        return (
            <div>
                <BlockHoverMenu>
                    {rootWorkspace &&
                        <WorkspaceCard workspace={rootWorkspace} availablePointers={availablePointers} workspaces={workspaces} />
                    }
                </BlockHoverMenu>
            </div>
        );
    }
}

const options: any = ({ match }) => ({
    variables: { workspaceId: match.params.workspaceId },
});

export const WorkspaceSubtreePage = compose(
    graphql(WORKSPACES_QUERY, { name: "workspaceSubtreeWorkspaces", options }),
)(WorkspaceSubtreePagePresentational);
