import * as React from "react";

import styled from "styled-components";
import { Button, FormControl } from "react-bootstrap";

const FormStyle = styled.span`
  border-radius: 2px;
  box-shadow: 0 0 6px #666;
  display: inline-block;
  margin-left: 10px;
  padding: 10px;
`;

interface ChildBudgetFormProps {
  initialValue: number;
  min: number;
  max: number;
  onSubmit: (value: any) => void;
  onClose: () => void;
}

interface ChildBudgetFormState {
  value: number;
}

export class ChildBudgetForm extends React.Component<
  ChildBudgetFormProps,
  ChildBudgetFormState
> {
  public constructor(props: any) {
    super(props);
    this.state = { value: this.props.initialValue };
  }

  public render() {
    return (
      <FormStyle>
        <FormControl
          type="number"
          autoFocus={true}
          value={this.state.value}
          placeholder="0"
          min={this.props.min}
          max={this.props.max}
          onChange={(e: any) => {
            const { value } = e.target;
            this.setState({ value: parseInt(value, 10) });
          }}
          style={{ display: "inline-block", width: "100px" }}
        />
        <span style={{ color: "#999" }}>
          {` ${this.props.min} to ${this.props.max} `}
        </span>
        <Button
          onClick={() => {
            this.props.onSubmit(this.state.value);
            this.props.onClose();
          }}
          disabled={!this.isValid()}
        >
          Submit
        </Button>
        <Button onClick={this.props.onClose}>Close</Button>
      </FormStyle>
    );
  }

  private isValid() {
    const { value } = this.state;
    const inRange = value >= this.props.min && value <= this.props.max;
    return !!value && inRange;
  }
}
