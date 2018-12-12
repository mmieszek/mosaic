import { css, StyleSheet } from "aphrodite";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { connect } from "react-redux";
import styled from "styled-components";
import { ShowExpandedPointer } from "./ShowExpandedPointer";
import { propsToPointerDetails } from "./helpers";
import { changePointerReference } from "../../modules/blockEditor/actions";
import {
  pointerImportNameColor,
  pointerImportNameColorOnHover,
} from "../../styles";

const RemovedPointer = styled.span`
  background-color: rgba(252, 86, 86, 0.66);
  padding: 0 3px;
  border-radius: 2px;
  font-weight: 800;
  color: #7f0a0a;
`;

const bracketFont = "800 1.2em sans-serif";

const ClosedPointerImport: any = styled.span`
  background-color: ${pointerImportNameColor};
  color: rgb(233, 239, 233);
  cursor: pointer;
  padding: 0 4px;
  border-radius: 4px;
  transition: background-color color 0.8s;
  &:hover {
    background-color: ${pointerImportNameColorOnHover};
  }
`;

const OpenPointerImport: any = styled.span`
  background: ${(props: any) =>
    props.isSelected
      ? "rgba(111, 186, 209, 0.66)"
      : "rgba(158, 224, 244, 0.66)"};
  border-radius: 2px;
  color: #000;
  cursor: pointer;
  font-weight: 500;
  transition: background-color color 0.8s;
`;

const Brackets: any = styled.span`
  &:before {
    color: ${pointerImportNameColor};
    content: "[";
    font: ${bracketFont};
  }

  &:after {
    color: ${pointerImportNameColor};
    content: "]";
    font: ${bracketFont};
  }
`;

class PointerImportNodePresentational extends React.Component<any, any> {
  public constructor(props: any) {
    super(props);

    const onHomepageOrTreeView = !props.exportLockStatusInfo;
    if (onHomepageOrTreeView) {
      this.state = {
        isLocked: false,
      };
    } else {
      const exportPointerId = props.nodeAsJson.data.pointerId;
      const isLockedRelation = props.exportLockStatusInfo && props.exportLockStatusInfo.find(obj => obj.pointerId === exportPointerId);
      const exportIsVisible = this.props.visibleExportIds.find(id => id === exportPointerId);
      const isLocked = !exportIsVisible && (!isLockedRelation || isLockedRelation.isLocked);

      this.state = {
        isLocked,
      };
    }
  }

  public getLocation = () => {
    const rect = ReactDOM.findDOMNode(this).getBoundingClientRect();
    const { left, right, top, bottom } = rect;
    return { left, right, top, bottom };
  };

  public onMouseOver = () => {
    if (this.props.isHoverable) {
      const { left, right, top, bottom } = this.getLocation();
      this.props.onMouseOver({
        left,
        right,
        top,
        bottom,
        id: this.props.nodeAsJson.data.internalReferenceId
      });
    }
  };

  public handleClosedPointerClick = (e: Event, pointerId: string, exportPointerId: string) => {
    if (this.isLocked() && this.state.isLocked) {
      this.setState({ isLocked: false });
      this.props.unlockPointer(exportPointerId);
    } else {
      this.props.openClosedPointer(pointerId);
    }
    e.stopPropagation( );
  }

  public handleOpenPointerClick = (e: Event, pointerId: string) => {
    this.props.closeOpenPointer(pointerId);
    e.stopPropagation();
  }

  public isLocked() {
    const onHomepageOrTreeView = !this.props.exportLockStatusInfo;
    if (onHomepageOrTreeView) {
      return false;
    }

    const exportPointerId = this.props.nodeAsJson.data.pointerId;
    const isLockedRelation = this.props.exportLockStatusInfo.find(obj => obj.pointerId === exportPointerId);
    const exportIsVisible = this.props.visibleExportIds.find(id => id === exportPointerId);
    const isLocked = !exportIsVisible && (!isLockedRelation || isLockedRelation.isLocked);

    return isLocked;
  }

  public render() {
    const {
      availablePointers,
      blockEditor,
      visibleExportIds,
      nodeAsJson,
    } = this.props;

    const {
      importingPointer,
      isSelected,
      pointerIndex,
      isOpen
    } = propsToPointerDetails({
      blockEditor,
      availablePointers,
      nodeAsJson
    });

    const styles = StyleSheet.create({
      OuterPointerImportStyle: {
        ":before": {
          backgroundColor: pointerImportNameColor,
          color: "rgb(233, 239, 233)",
          content: `"$${pointerIndex + 1}"`,
          borderRadius: "4px 0px 0px 4px",
          padding: "0px 3px",
        },
      },
    });

    const pointerId: string = this.props.nodeAsJson.data.internalReferenceId;
    const exportPointerId: string = this.props.nodeAsJson.data.pointerId;

    if (!importingPointer) {
      return (
        <RemovedPointer
          onMouseOver={this.onMouseOver}
          onMouseOut={this.props.onMouseOut}
        >
          N/A
        </RemovedPointer>
      );
    }

    if (!isOpen) {
      return (
        <ClosedPointerImport
          onClick={e => this.handleClosedPointerClick(e, pointerId, exportPointerId)}
          onMouseOver={this.onMouseOver}
          onMouseOut={this.props.onMouseOut}
          style={{
            whiteSpace: "nowrap",
          }}
        >
          {this.state.isLocked && this.isLocked() ? "🔒$" : "$"}
          {`${pointerIndex + 1}`}
        </ClosedPointerImport>
      );
    } else {
      return (
        <OpenPointerImport
          isSelected={isSelected}
          onClick={e => this.handleOpenPointerClick(e, pointerId)}
        >
          <span className={css(styles.OuterPointerImportStyle)}>
            <span onClick={e => e.stopPropagation()}>
              <Brackets>
                <ShowExpandedPointer
                  blockEditor={blockEditor}
                  exportingPointer={importingPointer}
                  availablePointers={availablePointers}
                  onMouseOverExpandedPointer={this.onMouseOver}
                  onMouseOverPointerImport={this.props.onMouseOver}
                  onMouseOut={this.props.onMouseOut}
                  isHoverable={this.props.isHoverable}
                  visibleExportIds={visibleExportIds}
                  exportLockStatusInfo={this.props.exportLockStatusInfo}
                  unlockPointer={this.props.unlockPointer}
                />
              </Brackets>
            </span>
          </span>
        </OpenPointerImport>
      );
    }
  }
}

const mapDispatchToProps = (dispatch: (actionObjectOrThunkFn: any) => any) => ({
  openClosedPointer: (pointerId: string) => dispatch(changePointerReference({
    id: pointerId,
    reference: { isOpen: true },
  })),

  closeOpenPointer: (pointerId: string) => dispatch(changePointerReference({
    id: pointerId,
    reference: { isOpen: false },
  })),
});

export const PointerImportNode = connect(null, mapDispatchToProps)(PointerImportNodePresentational);
