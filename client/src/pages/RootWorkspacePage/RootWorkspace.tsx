import * as React from "react";
import { graphql } from "react-apollo";
import { Button } from "react-bootstrap";
import { Link } from "react-router-dom";
import { compose } from "recompose";
import styled from "styled-components";

import { AdminControls } from "./AdminControls";
import { RootBlock } from "./RootBlock";
import { Auth } from "../../auth";
import {
  UPDATE_WORKSPACE_IS_ELIGIBLE,
  UPDATE_WORKSPACE_IS_PUBLIC,
} from "../../graphqlQueries";

import {
  homepageWorkspaceBgColor,
  homepageWorkspaceScratchpadFontColor,
  blockBorderAndBoxShadow
} from "../../styles";

const WorkspaceContainer = styled.div`
  ${blockBorderAndBoxShadow};
  background-color: ${homepageWorkspaceBgColor};
  padding: 10px;
  display: flex;
  justify-content: space-between;
`;

const ScratchpadContainer = styled.div`
  color: ${homepageWorkspaceScratchpadFontColor};
`;

const workspaceToBlock = (workspace, blockType) =>
  workspace.blocks && workspace.blocks.find(b => b.type === blockType);

class RootWorkspacePresentational extends React.Component<any, any> {
  public render() {
    const workspace = this.props.workspace;

    const question = workspaceToBlock(workspace, "QUESTION");
    const answer = workspaceToBlock(workspace, "ANSWER");
    const scratchpad = workspaceToBlock(workspace, "SCRATCHPAD");

    return (
      <WorkspaceContainer style={this.props.style}>
        <div style={{flex: "1 0 0px", minWidth: 0}}>
          {
            Auth.isAdmin()
            &&
            <AdminControls workspace={workspace} />
          }
          <Link to={`/workspaces/${workspace.id}`}>
            <RootBlock
              availablePointers={workspace.connectedPointers}
              block={question}
            />
          </Link>
          <br />
          <ScratchpadContainer>
            <RootBlock
              availablePointers={workspace.connectedPointers}
              block={scratchpad}
              defaultText="(no description)"
            />
          </ScratchpadContainer>
          <RootBlock
            availablePointers={workspace.connectedPointers}
            block={answer}
          />
        </div>
        <div style={{flexShrink: 0, flexGrow: 0, display: "flex", flexDirection: "column", justifyContent: "space-between"}}>
          <Link to={`/workspaces/${workspace.id}/subtree`}>
            <Button
              bsSize="xsmall"
              bsStyle="default"
              className="pull-right"
              style={{
                margin: "5px 1px",
                padding: "1px 4px",
              }}
            >
              Tree »
            </Button>
          </Link>
        </div>
      </WorkspaceContainer>
    );
  }
}

const RootWorkspace: any = compose(
  graphql(UPDATE_WORKSPACE_IS_ELIGIBLE, {
    name: "updateWorkspaceIsEligible",
    options: {
      refetchQueries: ["RootWorkspacesQuery"]
    }
  }),
  graphql(UPDATE_WORKSPACE_IS_PUBLIC, {
    name: "updateWorkspaceIsPublic",
    options: {
      refetchQueries: ["RootWorkspacesQuery"]
    }
  })
)(RootWorkspacePresentational);

export { RootWorkspace };
