import * as React from "react";
import styled from "styled-components";
import { Button, Badge, FormControl } from "react-bootstrap";
import { Link } from "react-router-dom";
import { BlockEditor } from "../../components/BlockEditor";
import { NewBlockForm } from "../../components/NewBlockForm";
import { WorkspaceBlockRelation, WorkspaceRelationTypes } from "./WorkspaceRelations";

const ChildStyle = styled.div`
    border: 2px solid #ddd;
    padding: 1em;
    margin-bottom: 1em;
    float: left;
    width: 100%;
`;

const FormStyle = styled.div`
  margin-top: 10px;
  background: #eee;
  padding: 10px;
  float: left;
  border-radius: 2px;
`;

export class TransferForm extends React.Component<any, any> {
    public constructor(props: any) {
        super(props);
        this.state = { value: this.props.initialValue };
    }

    public render() {
        return (
            <FormStyle>
                <div style={{ width: "100px", float: "left" }}>
                    <FormControl
                        type="number"
                        autoFocus={true}
                        value={this.state.value}
                        placeholder="0"
                        min={this.props.min}
                        max={this.props.max}
                        onChange={(e: any) => {
                            const { value } = e.target;
                            this.setState({ value: value });
                        }}
                    />
                </div>
                {`${this.props.min} to ${this.props.max}`}

                <div style={{ float: "left" }}>
                    <Button
                        onClick={() => {
                            this.props.onSubmit(parseInt(this.state.value, 10));
                            this.props.onClose();
                        }}
                        disabled={!this.isValid()}
                    >
                        Submit
                    </Button>
                    <Button
                        onClick={this.props.onClose}
                    >
                        Close
                    </Button>
                </div>
            </FormStyle>
        );
    }

    private isValid() {
        const valueAsInt = parseInt(this.state.value, 10);
        const inRange = (valueAsInt >= this.props.min && valueAsInt <= this.props.max);
        return !!valueAsInt && inRange;
    }
}

export class Child extends React.Component<any, any> {
    public constructor(props: any) {
        super(props);
        this.state = { showTransferForm: false };
    }

    public render() {
        const workspace = this.props.workspace;
        const availablePointers = this.props.availablePointers;
        const questionRelationship = new WorkspaceBlockRelation(WorkspaceRelationTypes.SubworkspaceQuestion, workspace);
        const answerRelationship = new WorkspaceBlockRelation(WorkspaceRelationTypes.SubworkspaceAnswer, workspace);
        return (
            <ChildStyle>
                {questionRelationship.findBlock().value &&
                    <BlockEditor
                        {...questionRelationship.blockEditorAttributes()}
                        availablePointers={availablePointers}
                    />
                }

                {answerRelationship.findBlock().value &&
                    <BlockEditor
                        {...answerRelationship.blockEditorAttributes()}
                        availablePointers={availablePointers}
                    />
                }

                <div>
                    <Link to={`/workspaces/${workspace.id}`}>
                        <Button> Open </Button>
                    </Link>
                    <Button onClick={this.props.onDelete}>
                        Archive
                </Button>
                    {!this.state.showTransferForm &&
                        <Button onClick={() => { this.setState({ showTransferForm: true }); }}>
                            Edit Allocation
                    </Button>
                    }
                    <div style={{ float: "right" }}>
                        <Badge>{workspace.totalBudget - workspace.allocatedBudget} / {workspace.totalBudget}</Badge>
                    </div>
                </div>
                {this.state.showTransferForm &&
                    <TransferForm
                        initialValue={workspace.totalBudget}
                        min={workspace.allocatedBudget}
                        max={parseInt(workspace.totalBudget, 10) + parseInt(this.props.parentAvailableBudget, 10)}
                        onSubmit={(totalBudget) => { this.props.onUpdateChildTotalBudget({ childId: workspace.id, totalBudget }); }}
                        onClose={() => this.setState({ showTransferForm: false })}
                    />
                }
            </ChildStyle>
        );
    }
}

export class ChildrenSidebar extends React.Component<any, any> {
    private newChildField;

    public editor = () => {
        return this.newChildField && this.newChildField.editor();
    }

    public render() {
        return (
            <div>
                {!!this.props.workspaceOrder.length &&
                    <div>
                        <h3> Existing Children </h3>
                        {this.props.workspaceOrder.map((workspaceId) => {
                            const workspace = this.props.workspaces.find((w) => w.id === workspaceId);
                            return (
                                <Child
                                    workspace={workspace}
                                    key={workspace.id}
                                    onDelete={() => { this.props.changeOrder(this.props.workspaceOrder.filter((w) => w !== workspace.id)); }}
                                    availablePointers={this.props.availablePointers}
                                    parentAvailableBudget={this.props.availableBudget}
                                    onUpdateChildTotalBudget={this.props.onUpdateChildTotalBudget}
                                />
                            );
                        }
                        )}
                    </div>
                }
                <h3> Add a new Child Question </h3>
                <NewBlockForm
                    maxTotalBudget={this.props.availableBudget}
                    onMutate={this.props.onCreateChild}
                    availablePointers={this.props.availablePointers}
                    ref={(input) => { this.newChildField = input; }}
                />
            </div>
        );
    }
}
