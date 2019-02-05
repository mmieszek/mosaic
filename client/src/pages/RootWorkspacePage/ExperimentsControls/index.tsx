import gql from "graphql-tag";
import * as React from "react";
import { graphql } from "react-apollo";
import { compose } from "recompose";
import styled from "styled-components";

import {
  homepageWorkspaceBgColor,
  blockBorderAndBoxShadow
} from "../../../styles";

import { ExperimentControl } from "./ExperimentControl";

const ExperimentsContainer = styled.div`
  ${blockBorderAndBoxShadow};
  background-color: ${homepageWorkspaceBgColor};
  padding: 10px;
  margin-bottom: 30px;
`;

export class ListOfExperimentsPresentational extends React.Component<any, any> {
  public render() {
    return (
      <ExperimentsContainer>
        {
          this.props.experimentsQuery.loading
          ? 
          "Loading..."
          : 
          this.props.experimentsQuery.experiments.map(e => {
            return (
              <ExperimentControl
                experiment={e}
                fallbacks={e.fallbacks}
                key={e.id}
                onEligibilityRankChange={this.onEligibilityRankChange}
                updateExperimentName={async ({ experimentId, name }) => await this.props.updateExperimentNameMutation({
                  variables: {
                    experimentId,
                    name,
                  },
                })}
              />
            );
          })
        }
      </ExperimentsContainer>
    );
  }

  private onEligibilityRankChange = (experimentId, value) => {
    this.props.updateExperimentEligibilityRankMutation({
      variables: {
        experimentId,
        eligibilityRank: value,
      },
    });
  }
}

const EXPERIMENTS_QUERY = gql`
  query experiments {
    experiments {
      id
      createdAt
      name
      eligibilityRank
      fallbacks {
        id
        createdAt
        name
      }
    }
  }
`; 

const UPDATE_EXPERIMENT_ELIGIBILITY_RANK_MUTATION = gql`
  mutation updateExperimentEligibilityRank($eligibilityRank: Int, $experimentId: String) {
    updateExperimentEligibilityRank(eligibilityRank: $eligibilityRank, experimentId: $experimentId)
  }
`; 

const UPDATE_EXPERIMENT_NAME_MUTATION = gql`
  mutation updateExperimentName($experimentId: String, $name: String) {
    updateExperimentName(experimentId: $experimentId, name: $name)
  }
`;

export const ListOfExperiments: any = compose(
  graphql(EXPERIMENTS_QUERY, {
    name: "experimentsQuery"
  }),
  graphql(UPDATE_EXPERIMENT_ELIGIBILITY_RANK_MUTATION, {
    name: "updateExperimentEligibilityRankMutation",
    options: {
      refetchQueries: ["experiments"],
    }
  }),
  graphql(UPDATE_EXPERIMENT_NAME_MUTATION, {
    name: "updateExperimentNameMutation",
    options: {
      refetchQueries: ["experiments"],
    }
  })
)(ListOfExperimentsPresentational);
