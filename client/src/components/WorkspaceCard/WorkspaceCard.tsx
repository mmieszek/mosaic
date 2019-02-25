import styled from "styled-components";
import * as React from "react";
import { Button } from "react-bootstrap";
import { BlockSection } from "./BlockSection";
import { ChildrenSection } from "./ChildrenSection";
import _ = require("lodash");
import { ChildBudgetBadge } from "../ChildBudgetBadge";

import { AdminCheckboxThatTogglesWorkspaceField } from "../AdminCheckboxThatTogglesWorkspaceField";

import { Auth } from "../../auth";

import {
  blockBorderAndBoxShadow,
  treeWorkspaceBgColor,
} from "../../styles";

export enum toggleTypes {
  FULL,
  QUESTION = 0,
  ANSWER,
  SCRATCHPAD,
  CHILDREN
}

const Container = styled.div`
  float: left;
`;

const CardBody = styled.div`
  ${blockBorderAndBoxShadow};
  float: left;
  margin-bottom: 1em;
  width: 42em;
  background: ${treeWorkspaceBgColor};
  position: relative;
`;

// TODO: Eventually these should be used in a common file for many cases that use them.
interface ConnectedPointerType {
  data: any;
  isVoid: boolean;
  object: string;
  type: string;
  nodes: any[];
}

interface WorkspaceType {
  blocks: any[];
  childWorkspaceOrder: string[];
  connectedPointersOfSubtree: ConnectedPointerType[];
  id: string;
  isStale: boolean;
  isEligibleForOracle: boolean;
  budgetUsedWorkingOnThisWorkspace: number;
  allocatedBudget: number;
  wasAnsweredByOracle: boolean;
  isArchived: boolean;
  subtreeTimeSpentData: any;
  isNotStaleRelativeToUserFullInformation: any;
}

interface WorkspaceCardProps {
  isExpanded: boolean;
  isInOracleModeAndIsUserOracle: boolean;
  isTopLevelOfCurrentTree: boolean;
  markWorkspaceStaleForUser: any;
  parentPointers: ConnectedPointerType[];
  workspaceId: string;
  subtreeQuery: SubtreeQuery;
  subtreeTimeSpentQuery: any;
  subtreeTimeSpentData: any;
  oracleModeQuery: any;
  updateWorkspace: any;
}

interface SubtreeQuery {
  loading: boolean;
  workspace: any;
  refetch: any;
  updateQuery: any;
}

interface WorkspaceCardState {
  toggles: {
    [toggleTypes.SCRATCHPAD]: boolean;
    [toggleTypes.CHILDREN]: boolean;
  };
}

const getPointerId = (p: any) => p.data.pointerId;

export class WorkspaceCardPresentational extends React.PureComponent<WorkspaceCardProps, WorkspaceCardState> {
  public constructor(props: any) {
    super(props);

    this.state = {
      toggles: {
        [toggleTypes.SCRATCHPAD]: true,
        [toggleTypes.CHILDREN]: (this.props.isInOracleModeAndIsUserOracle || this.props.isExpanded) ? true : false
      },
    };
  }

  public handleChangeToggle = (name: toggleTypes, value: boolean) => {
    const newToggles = { ...this.state.toggles };
    newToggles[name] = value;
    this.setState({ toggles: newToggles });
  };

  public render() {
    const workspace: WorkspaceType = this.props.subtreeQuery.workspace;

    const editable = Auth.isAuthorizedToEditWorkspace(workspace);

    const availablePointers: ConnectedPointerType[] =
      !this.props.isTopLevelOfCurrentTree
      ?
      this.props.parentPointers
      :
        (
          workspace
          ?
          _(workspace.connectedPointersOfSubtree)
            .uniqBy(getPointerId)
            .map(node => ({...node, readOnly: !editable }))
            .value()
          :
          []
        );

    const subtreeTimeSpentData =
      this.props.isTopLevelOfCurrentTree
      ?
      JSON.parse(this.props.subtreeTimeSpentQuery.subtreeTimeSpent)
      :
      this.props.subtreeTimeSpentData;

    const isInOracleMode = this.props.oracleModeQuery.oracleMode;

    return (
      <Container style={{ opacity: workspace.isArchived ? 0.25 : 1 }}>
        <CardBody>
          <div
            style={{
              backgroundColor: "#f8f8f8",
              borderBottom: "1px solid #ddd",
              color: "#999",
              fontSize: "12px",
              padding: "10px",
            }}
          >
            <div
              style={{
                alignItems: "center",
                display: "flex",
                height: "40px",
                justifyContent: "space-between",
                paddingBottom: "10px",
              }}
            >
              <span>
                <ChildBudgetBadge
                  noBadge={true}
                  shouldShowSeconds={false}
                  style={{ color: "#555", fontSize: "12px" }}
                  totalBudget={subtreeTimeSpentData[workspace.id]}
                />
                {" "}work on this entire subtree
                <br />
                <ChildBudgetBadge
                  noBadge={true}
                  shouldShowSeconds={false}
                  style={{ color: "#555", fontSize: "12px" }}
                  totalBudget={workspace.budgetUsedWorkingOnThisWorkspace}
                />
                {" "}work on this workspace
              </span>

              {
                workspace.wasAnsweredByOracle
                &&
                isInOracleMode
                &&
                <span style={{ color: "darkRed"}}>
                  WAS ANSWERED BY ORACLE
                </span>
              }
              {
                Auth.isAdmin()
                &&
                <span style={{ padding: "0 10px"}}>
                  <AdminCheckboxThatTogglesWorkspaceField
                    checkboxLabelText="is stale"
                    updateMutation={this.handleOnIsStaleCheckboxChange}
                    workspace={workspace}
                    workspaceFieldToUpdate="isStale"
                  />
                  <AdminCheckboxThatTogglesWorkspaceField
                    checkboxLabelText="oracle only"
                    updateMutation={this.handleOnIsEligibleForOracleCheckboxChange}
                    workspace={workspace}
                    workspaceFieldToUpdate="isEligibleForOracle"
                  />
                  <AdminCheckboxThatTogglesWorkspaceField
                    checkboxLabelText="currently resolved"
                    updateMutation={this.handleOnIsCurrentlyResolvedCheckboxChange}
                    workspace={workspace}
                    workspaceFieldToUpdate="isCurrentlyResolved"
                  />
                </span>
                }
            </div>
            {
              Auth.isAdmin()
              &&
              <div
                style={{
                  padding: "10px 10px 0 10px",
                  width: "100%",
                }}
              >
                Users who have passed on workspace with "Needs More Work":
                <ul style={{paddingInlineStart: "30px"}}>
                {workspace.isNotStaleRelativeToUserFullInformation.map((user, i, arr) => {
                  return (
                    <li key={user.id} style={{ margin: i < arr.length - 1 ? "10px 0" : "5px 0 0 0" }}>
                      {
                        user.givenName
                        ?
                        `${user.givenName} ${user.familyName}`
                        :
                        user.id
                      }
                      <Button
                        bsSize="xsmall"
                        onClick={async () => {
                          await this.props.markWorkspaceStaleForUser({
                            userId: user.id,
                            workspaceId: workspace.id,
                          });

                          this.props.subtreeQuery.updateQuery((prv: any, opt: any) => {
                            return {
                              ...prv,
                              workspace: {
                                ...prv.workspace,
                                isNotStaleRelativeToUserFullInformation: prv.workspace.isNotStaleRelativeToUserFullInformation.filter(u => u.id !== user.id)
                              },
                            };
                          });
                        }}
                        style={{ marginLeft: "8px" }}
                      >
                        make stale for user
                      </Button>
                    </li>
                  );
                })}
                {
                  workspace.isNotStaleRelativeToUserFullInformation.length === 0
                  &&
                  "None"
                }
                </ul>
              </div>
            }
          </div>
          <BlockSection
            workspace={workspace}
            availablePointers={availablePointers}
          />
        </CardBody>
        <ChildrenSection
          parentPointers={availablePointers}
          workspace={workspace}
          childrenToggle={this.state.toggles[toggleTypes.CHILDREN]}
          onChangeToggle={() =>
            this.handleChangeToggle(
              toggleTypes.CHILDREN,
              !this.state.toggles[toggleTypes.CHILDREN]
            )
          }
          subtreeTimeSpentData={subtreeTimeSpentData}
        />
      </Container>
    );
  }

  // TODO: This code template for checkboxes is reused in several places (Here and in RootWorkspacePage/index.tsx).  Unify usage?
  private handleOnIsStaleCheckboxChange = async () => {
    await this.props.updateWorkspace({
      variables: {
        id: this.props.workspaceId,
        input: {
          isStale: !this.props.subtreeQuery.workspace.isStale,
        },
      },
    });

    this.props.subtreeQuery.updateQuery((prv: any, opt: any) => {
      return {
        ...prv,
        workspace: {
          ...prv.workspace,
          isStale: !this.props.subtreeQuery.workspace.isStale
        },
      };
    });
  }

  private handleOnIsEligibleForOracleCheckboxChange = async () => {
    await this.props.updateWorkspace({
      variables: {
        id: this.props.workspaceId,
        input: {
          isEligibleForOracle: !this.props.subtreeQuery.workspace.isEligibleForOracle,
        },
      },
    });

    this.props.subtreeQuery.updateQuery((prv: any, opt: any) => {
      return {
        ...prv,
        workspace: {
          ...prv.workspace,
          isEligibleForOracle: !this.props.subtreeQuery.workspace.isEligibleForOracle
        },
      };
    });
  }

  private handleOnIsCurrentlyResolvedCheckboxChange = async () => {
    await this.props.updateWorkspace({
      variables: {
        id: this.props.workspaceId,
        input: {
          isCurrentlyResolved: !this.props.subtreeQuery.workspace.isCurrentlyResolved,
        },
      },
    });

    this.props.subtreeQuery.updateQuery((prv: any, opt: any) => {
      return {
        ...prv,
        workspace: {
          ...prv.workspace,
          isCurrentlyResolved: !this.props.subtreeQuery.workspace.isCurrentlyResolved
        },
      };
    });
  }
}
