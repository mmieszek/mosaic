import * as React from "react";
import styled from "styled-components";
import { Button } from "react-bootstrap";
import { Link } from "react-router-dom";

interface NextWorkspaceBtnProps {
  bsStyle: string;
  experimentId: string;
  label: string;
  navHook?: () => void;
}

const NextWorkspaceBtn = ({ bsStyle, experimentId, label, navHook }: NextWorkspaceBtnProps) => {
  return (
    <Link onClick={navHook} to={`/next?experiment=${experimentId}`} style={{ margin: "0 5px" }}>
      <Button bsSize="small" bsStyle={bsStyle}>{label} »</Button>
    </Link>
  );
};

const TakeBreakBtn = ({ bsStyle, experimentId, label, navHook }: NextWorkspaceBtnProps) => {
  return (
    <Link onClick={navHook} to={`/break?experiment=${experimentId}`} style={{ margin: "0 5px" }}>
      <Button bsSize="small" bsStyle={bsStyle}>{label} »</Button>
    </Link>
  );
};

const EpisodeNavContainer = styled.div`
  padding: 10px;
  background-color: #b8ddfb;
  border-bottom: 1px solid #c8c8c8;
  text-align: center;
`;

interface EpisodeNavProps {
  experimentId: string;
  hasSubquestions: boolean;
  hasTimeBudget: boolean;
  hasTimerEnded: boolean;
  isActive: boolean;
  isInOracleMode: boolean;
  isTakingABreak?: boolean;
  isUserOracle: boolean;
  isUserMaliciousOracle: boolean;
  markAsNotStaleRelativeToUser(): void;
}

// Note that there in the normal functioning of the app,
// transferRemainingBudgetToParent and markAsNotStaleRelativeToUser will not be undefined
// wherever they are called. Nevertheless, guards are included below because
// it's possible for this situation to arise given abnormal functioning of the
// app.
class EpisodeNavPresentational extends React.Component<EpisodeNavProps, any> {
  public render() {
    const {
      experimentId,
      hasTimeBudget,
      hasTimerEnded,
      isActive,
      isInOracleMode,
      isTakingABreak,
      isUserOracle,
      isUserMaliciousOracle,
      markAsNotStaleRelativeToUser,
    } = this.props;

    if (isUserOracle && isInOracleMode) {
      return (
        <EpisodeNavContainer style={{ backgroundColor: isUserMaliciousOracle ? "#ffcccc" : "#ccffcc" }}>
          {
            isTakingABreak
            ?
              <NextWorkspaceBtn
                bsStyle="default"
                experimentId={experimentId}
                label={"Start on next workspace (Oracle Mode)"}
              />
            :
              <div
                style={{
                  color: isUserMaliciousOracle ? "#a66" : "#6a6",
                  fontSize: "24px",
                  fontVariant: "small-caps"
                }}
              >
                {isUserMaliciousOracle ? "malicious" : "honest"} oracle mode
              </div>
          }
        </EpisodeNavContainer>
      );
    }

    return (
      <EpisodeNavContainer>
        {
          isActive
          ?
          (
            hasTimeBudget && hasTimerEnded
            ?
              <NextWorkspaceBtn
                bsStyle="primary"
                experimentId={experimentId}
                label="Get next workspace"
              />
            :
              <div>
                <TakeBreakBtn
                  bsStyle="primary"
                  experimentId={experimentId}
                  label="Needs more work"
                  navHook={() => markAsNotStaleRelativeToUser && markAsNotStaleRelativeToUser()}
                />
              </div>
          )
          :
          <NextWorkspaceBtn
            bsStyle="primary"
            experimentId={experimentId}
            label={isTakingABreak ? "Start on next workspace" : "Get started"}
          />
        }
      </EpisodeNavContainer>
    );
  }
}

const EpisodeNav: any = EpisodeNavPresentational;

export { EpisodeNav };
