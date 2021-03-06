import { isInOracleMode } from "../globals/isInOracleMode";
import * as _ from "lodash";
import { resolver, attributeFields } from "graphql-sequelize";
import {
  GraphQLBoolean,
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLInt,
  GraphQLList,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} from "graphql";
import GraphQLJSON from "graphql-type-json";
import * as Sequelize from "sequelize";

import { requireAdmin, requireOracle, requireUser } from "./auth";

import { isUserAdmin } from "./auth/isUserAdmin";
import { userFromAuthToken } from "./auth/userFromAuthToken";
import { userFromContext } from "./auth/userFromContext";

import { getMessageForUser } from "./helpers/getMessageForUser";

import { createScheduler, schedulers } from "../scheduler";
import { map } from "asyncro";
import Block from "../models/block";
import Workspace from "../models/workspace";
import UserTreeOracleRelation from "../models/userTreeOracleRelation";
import User from "../models/user";
import Experiment from "../models/experiment";
import Instructions, { InstructionTypes } from "../models/instructions";
import Tree from "../models/tree";
import Pointer from "../models/pointer";
import PointerImport from "../models/pointerImport";
import ExportWorkspaceLockRelation from "../models/exportWorkspaceLockRelation";

const generateReferences = references => {
  const all = {};
  references.map(([fieldName, graphqlType]) => {
    all[fieldName] = {
      type: graphqlType(),
      resolve: async instance => await instance.$get(fieldName),
    };
  });
  return all;
};

const makeObjectType = (model, references, extraFields = {}) =>
  new GraphQLObjectType({
    name: model.name,
    description: model.name,
    fields: () =>
      _.assign(
        attributeFields(model),
        generateReferences(references),
        extraFields,
      ),
  });

const blockType = makeObjectType(Block, [["workspace", () => workspaceType]]);

import { UserType } from "./User";

export const workspaceType = makeObjectType(
  Workspace,
  [
    ["childWorkspaces", () => new GraphQLList(workspaceType)],
    ["parentWorkspace", () => new GraphQLList(workspaceType)],
    ["blocks", () => new GraphQLList(blockType)],
    ["pointerImports", () => new GraphQLList(pointerImportType)],
    ["tree", () => treeType],
  ],
  {
    message: {
      type: GraphQLString,
      resolve: async (workspace: Workspace, args, context) => {
        const user = context.user;

        if (!user) {
          return null;
        }

        const rootWorkspace = await workspace.getRootWorkspace();

        // get experiment id
        const tree = (await rootWorkspace.$get("tree")) as Tree;
        const experiments = (await tree.$get("experiments")) as Experiment[];
        if (experiments.length === 0) {
          return null;
        }

        const mostRecentExperiment = _.sortBy(
          experiments,
          e => -e.createdAt,
        )[0];
        const experimentId = mostRecentExperiment.id;

        const instructions = await Instructions.findAll({
          where: { experimentId },
        });
        const instructionValues = {};
        instructions.forEach(instruction => {
          instructionValues[instruction.type] = instruction.value;
        });

        if (workspace.isRequestingLazyUnlock) {
          return await getMessageForUser({
            isRequestingLazyUnlock: workspace.isRequestingLazyUnlock,
            instructions: instructionValues,
          });
        }

        // get scheduler
        let scheduler;
        if (schedulers.has(experimentId)) {
          scheduler = schedulers.get(experimentId);
        } else {
          scheduler = await createScheduler(experimentId);
        }

        const isWorkspaceRootLevel = !workspace.parentId;
        const isThisFirstTimeWorkspaceHasBeenWorkedOn = await scheduler.isThisFirstTimeWorkspaceHasBeenWorkedOn(
          workspace.id,
        );

        const userTreeOracleRelations = (await tree.$get(
          "oracleRelations",
        )) as UserTreeOracleRelation[];
        const thisUserTreeOracleRelation = userTreeOracleRelations.find(
          r => r.UserId === user.id,
        );

        const typeOfUser = !thisUserTreeOracleRelation
          ? "TYPICAL"
          : !thisUserTreeOracleRelation.isMalicious
          ? "HONEST"
          : "MALICIOUS";

        return await getMessageForUser({
          instructions: instructionValues,
          isWorkspaceRootLevel,
          isThisFirstTimeWorkspaceHasBeenWorkedOn,
          typeOfUser,
        });
      },
    },
    isUserOracleForTree: {
      type: GraphQLBoolean,
      resolve: async (workspace: Workspace, args, context) => {
        const user = context.user;

        if (!user) {
          return false;
        }

        // get tree
        const rootWorkspace = await workspace.getRootWorkspace();
        const tree = (await rootWorkspace.$get("tree")) as Tree;
        const oracles = (await tree.$get("oracles")) as User[];

        return oracles.some(o => o.id === user.id);
      },
    },
    isUserMaliciousOracleForTree: {
      type: GraphQLBoolean,
      resolve: async (workspace: Workspace, args, context) => {
        const user = context.user;

        if (!user) {
          return false;
        }

        // get tree
        const rootWorkspace = await workspace.getRootWorkspace();
        const tree = (await rootWorkspace.$get("tree")) as Tree;
        const userTreeOracleRelation = await UserTreeOracleRelation.findOne({
          where: {
            TreeId: tree.id,
            UserId: user.id,
          },
        });

        return userTreeOracleRelation && userTreeOracleRelation.isMalicious;
      },
    },
    currentlyActiveUser: {
      type: UserType,
      resolve: async (workspace: Workspace, args, context) => {
        const rootWorkspace = await workspace.getRootWorkspace();

        // get experiment id
        const tree = (await rootWorkspace.$get("tree")) as Tree;
        const experiments = (await tree.$get("experiments")) as Experiment[];
        if (experiments.length === 0) {
          return null;
        }

        const mostRecentExperiment = _.sortBy(
          experiments,
          e => -e.createdAt,
        )[0];
        const experimentId = mostRecentExperiment.id;

        // get scheduler
        let scheduler;
        if (schedulers.has(experimentId)) {
          scheduler = schedulers.get(experimentId);
        } else {
          scheduler = await createScheduler(experimentId);
        }

        // get user
        const userId = await scheduler.getIdOfCurrentlyActiveUser(workspace.id);
        if (!userId) {
          return null;
        }

        let user = await User.findByPk(userId);

        if (!user) {
          user = {
            id: userId,
            givenName: null,
            familyName: null,
          };
        }

        return user;
      },
    },
    isNotStaleRelativeToUserFullInformation: {
      type: new GraphQLList(UserType),
      resolve: async (workspace: Workspace, args, context) => {
        const fullInfo = await map(
          workspace.isNotStaleRelativeToUser,
          async userId => {
            let user = await User.findByPk(userId);
            if (!user) {
              const userInfo = await userFromAuthToken(context.authorization);

              user = {
                id: userId,
                givenName: null,
                familyName: null,
              };
            }

            return user;
          },
        );

        return fullInfo;
      },
    },
    rootWorkspace: {
      get type() {
        return workspaceType;
      },
      resolve: async (workspace: Workspace) => {
        return await workspace.getRootWorkspace();
      },
    },
  },
);

// TODO - factor out workspaceType into separate file so the following import
// can go at the top of the file -- right now it's down here to avoid circular
// import issues

import { UserActivityType } from "./UserActivity";

const OracleRelationsType = makeObjectType(UserTreeOracleRelation, [
  ["tree", () => treeType],
  ["user", () => UserType],
]);

const treeType = makeObjectType(Tree, [
  ["rootWorkspace", () => workspaceType],
  ["experiments", () => new GraphQLList(experimentType)],
  ["oracleRelations", () => new GraphQLList(OracleRelationsType)],
  ["oracles", () => new GraphQLList(UserType)],
]);

const instructionsEnumValues = {};
const instructionsFields = {};
InstructionTypes.forEach(type => {
  instructionsEnumValues[type] = {};
  instructionsFields[type] = { type: GraphQLString };
});

const instructionsEnumType = new GraphQLEnumType({
  name: "InstructionsEnum",
  values: instructionsEnumValues,
});

const instructionsObjectType = new GraphQLObjectType({
  name: "Instructions",
  fields: instructionsFields,
});

const experimentType = makeObjectType(
  Experiment,
  [
    ["fallbacks", () => new GraphQLList(experimentType)],
    ["trees", () => new GraphQLList(treeType)],
  ],
  {
    instructions: {
      type: instructionsObjectType,
      resolve: async (experiment: Experiment) => {
        const instructions = await Instructions.findAll({
          where: { experimentId: experiment.id },
        });
        const instructionValues = {};
        instructions.forEach(instruction => {
          instructionValues[instruction.type] = instruction.value;
        });
        return instructionValues;
      },
    },
  },
);

const pointerType = makeObjectType(Pointer, [
  ["pointerImport", () => pointerImportType],
  ["sourceBlock", () => blockType],
]);

const pointerImportType = makeObjectType(PointerImport, [
  ["workspace", () => blockType],
  ["pointer", () => pointerType],
]);

const oracleModeType = new GraphQLObjectType({
  name: "OracleMode",
  fields: {
    value: { type: GraphQLBoolean },
  },
});

const BlockInput = new GraphQLInputObjectType({
  name: "blockInput",
  fields: _.pick(attributeFields(Block), "value", "id"),
});

const WorkspaceInput = new GraphQLInputObjectType({
  name: "WorkspaceInput",
  fields: attributeFields(Workspace, { allowNull: true }),
});

function modelGraphQLFields(type: any, model: any) {
  return {
    type,
    args: { where: { type: GraphQLJSON } },
    resolve: resolver(model),
  };
}

const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: "RootQueryType",
    fields: {
      userActivity: {
        type: UserActivityType,
        args: {
          experimentId: { type: GraphQLString },
          userId: { type: GraphQLString },
        },
        resolve: async (_, { experimentId, userId }) => {
          let scheduler;
          if (schedulers.has(experimentId)) {
            scheduler = schedulers.get(experimentId);
          } else {
            scheduler = await createScheduler(experimentId);
          }

          return scheduler.getUserActivity(userId);
        },
      },
      oracleMode: {
        type: GraphQLBoolean,
        resolve: function() {
          return isInOracleMode.getValue();
        },
      },
      workspaces: {
        type: new GraphQLList(workspaceType),
        args: { where: { type: GraphQLJSON } },
        resolve: resolver(Workspace, {
          before: async function(findOptions, args, context, info) {
            const user = await userFromAuthToken(context.authorization);

            if (user == null) {
              findOptions.where = {
                isPublic: true,
                ...findOptions.where,
              };
            } else if (!user.is_admin) {
              findOptions.where = {
                [Sequelize.Op.or]: [
                  { creatorId: user.user_id },
                  { isPublic: true },
                ],
                ...findOptions.where,
              };
            }

            return findOptions;
          },
          after: async (result: Workspace[], args, ctx) => {
            // ensure root workspace has associated tree
            for (const workspace of result) {
              const tree = (await workspace.$get("tree")) as Tree;
              if (tree === null && !workspace.parentId) {
                await Tree.create({
                  rootWorkspaceId: workspace.id,
                });
              }
            }
            return result;
          },
        }),
      },
      workspace: {
        type: workspaceType,
        args: { id: { type: GraphQLString } },
        resolve: resolver(Workspace, {
          after: async (result: Workspace, args, ctx) => {
            // ensure root workspace has associated tree
            const tree = await result.$get("tree");
            if (tree === null && !result.parentId) {
              const tree = await Tree.create({
                rootWorkspaceId: result.id,
              });
            }

            // On Thursday, Nov 1 2018, a workspace failed to load on the
            // frontend. When looking into this, it was clear that this
            // workspace only had a QUESTION block on the backend, and no
            // ANSWER or SCRATCHPAD block and that this was the reason for the
            // error on the frontend.

            // Unclear how this could have occurred. But in order to prevent it
            // in the future, I added this graphql-sequelize "after" hook to
            // ensure the existence of the three required blocks.

            const blocks = (await result.$get("blocks")) as Block[];

            const includesQuestion = blocks.find(b => b.type === "QUESTION");
            const includesAnswer = blocks.find(b => b.type === "ANSWER");
            const includesScratchpad = blocks.find(
              b => b.type === "SCRATCHPAD",
            );
            const includesSubquestionDraft = blocks.find(
              b => b.type === "SUBQUESTION_DRAFT",
            );

            const includesAnswerDraft = blocks.find(
              b => b.type === "ANSWER_DRAFT",
            );

            if (!includesQuestion) {
              await result.$create("block", { type: "QUESTION" });
            }

            if (!includesAnswer) {
              await result.$create("block", { type: "ANSWER" });
            }

            if (!includesScratchpad) {
              await result.$create("block", { type: "SCRATCHPAD" });
            }

            if (!includesSubquestionDraft) {
              await result.$create("block", { type: "SUBQUESTION_DRAFT" });
            }

            if (!includesAnswerDraft) {
              const curBlocks = (await result.$get("blocks")) as Block[];
              const curAnswer = blocks.find(b => b.type === "ANSWER");
              if (curAnswer) {
                await result.$create("block", {
                  type: "ANSWER_DRAFT",
                  value: curAnswer.value,
                });
              }
            }

            return result;
          },
        }),
      },
      users: modelGraphQLFields(new GraphQLList(UserType), User),
      blocks: modelGraphQLFields(new GraphQLList(blockType), Block),
      trees: modelGraphQLFields(new GraphQLList(treeType), Tree),
      tree: {
        type: treeType,
        args: { id: { type: GraphQLString } },
        resolve: resolver(Tree),
      },
      experiments: modelGraphQLFields(
        new GraphQLList(experimentType),
        Experiment,
      ),
      experiment: {
        type: experimentType,
        args: { id: { type: GraphQLString } },
        resolve: resolver(Experiment),
      },
      pointers: modelGraphQLFields(new GraphQLList(pointerType), Pointer),
      subtreeTimeSpent: {
        type: GraphQLString, // is JSON stringified
        args: { id: { type: GraphQLString } },
        resolve: async function(obj, { id }) {
          const cacheForTimeSpentOnWorkspace = {};

          const loadDataForEachWorkspaceInSubtree = async workspace => {
            let timespentOnWorkspace = await workspace.budgetUsedWorkingOnThisWorkspace;
            for (const childId of workspace.childWorkspaceOrder) {
              const child = await Workspace.findByPk(childId);
              timespentOnWorkspace += await loadDataForEachWorkspaceInSubtree(
                child,
              );
            }
            cacheForTimeSpentOnWorkspace[workspace.id] = timespentOnWorkspace;
            return timespentOnWorkspace;
          };

          const workspace = await Workspace.findByPk(id);
          await loadDataForEachWorkspaceInSubtree(workspace);

          return JSON.stringify(cacheForTimeSpentOnWorkspace);
        },
      },
    },
  }),
  mutation: new GraphQLObjectType({
    name: "RootMutationType",
    fields: {
      updateOracleMode: {
        type: GraphQLBoolean,
        args: { oracleMode: { type: GraphQLBoolean } },
        resolve: requireOracle(
          "You must be logged in as an oracle to toggle oracle mode",
          async (_, { oracleMode }) => {
            isInOracleMode.setValue(oracleMode);
          },
        ),
      },
      updateBlocks: {
        type: new GraphQLList(blockType),
        args: {
          blocks: { type: new GraphQLList(BlockInput) },
          experimentId: { type: GraphQLString },
        },
        resolve: requireUser(
          "You must be logged in to update blocks",
          async (_, { blocks, experimentId }, context) => {
            let newBlocks: any = [];
            for (const _block of blocks) {
              const block = await Block.findByPk(_block.id);
              if (block === null) {
                continue;
              }

              const workspace = await Workspace.findByPk(block.workspaceId);

              if (workspace == null) {
                throw new Error(
                  "Got null workspace while attempting to update blocks",
                );
              }

              const user = await userFromContext(context);
              const userId = user.user_id;

              if (!user.is_admin) {
                if (!experimentId) {
                  throw new Error("User not participating in an experiment.");
                } else {
                  const experiment = await Experiment.findByPk(experimentId);

                  if (experiment == null) {
                    throw new Error(
                      "Experiment ID refers to non-existant experiment",
                    );
                  }

                  if (!experiment.isActive()) {
                    throw new Error("This experiment is not active.");
                  }

                  let scheduler;
                  if (schedulers.has(experimentId)) {
                    scheduler = schedulers.get(experimentId);
                  } else {
                    scheduler = await createScheduler(experimentId);
                  }

                  if (block.type === "QUESTION") {
                    const idOfCurrentlyActiveUserOfParent = await scheduler.getIdOfCurrentlyActiveUser(
                      workspace.parentId,
                    );
                    if (userId !== idOfCurrentlyActiveUserOfParent) {
                      throw new Error(
                        "User is not currently assigned to this workspace.",
                      );
                    }
                  } else {
                    const idOfCurrentlyActiveUser = await scheduler.getIdOfCurrentlyActiveUser(
                      workspace.id,
                    );
                    if (userId !== idOfCurrentlyActiveUser) {
                      throw new Error(
                        "User is not currently assigned to this workspace.",
                      );
                    }
                  }
                }
              }

              await block.update({ ..._block });

              if (
                isInOracleMode.getValue() &&
                !workspace.isEligibleForHonestOracle &&
                !workspace.isEligibleForMaliciousOracle &&
                workspace.parentId
              ) {
                const experiment = await Experiment.findByPk(experimentId);
                if (experiment === null) {
                  return newBlocks;
                }
                const isOracleExperiment =
                  experiment.areNewWorkspacesOracleOnlyByDefault;
                if (isOracleExperiment) {
                  const parentWorkspace = await Workspace.findByPk(
                    workspace.parentId,
                  );
                  if (parentWorkspace === null) {
                    return newBlocks;
                  }

                  if (parentWorkspace.parentId) {
                    const grandparentWorkspace = await Workspace.findByPk(
                      parentWorkspace.parentId,
                    );
                    if (grandparentWorkspace === null) {
                      return newBlocks;
                    }
                    const isUpdatingAnswerDraft = block.type === "ANSWER_DRAFT";
                    if (isUpdatingAnswerDraft) {
                      const blocks = (await grandparentWorkspace.$get(
                        "blocks",
                        { where: { type: "ANSWER_DRAFT" } },
                      )) as Block[];
                      await blocks[0].update({ ..._block });
                    }
                  }
                }
              }

              newBlocks = [...newBlocks, block];
            }
            return newBlocks;
          },
        ),
      },
      createExperiment: {
        type: GraphQLBoolean,
        args: {
          name: { type: GraphQLString },
        },
        resolve: requireAdmin(
          "You must be logged in as an admin to create an experiment",
          async (_, { name }) => {
            await Experiment.create({ name });
            return true;
          },
        ),
      },
      updateExperimentEligibilityRank: {
        type: GraphQLBoolean,
        args: {
          eligibilityRank: { type: GraphQLInt },
          experimentId: { type: GraphQLString },
        },
        resolve: requireAdmin(
          "You must be logged in as an admin to change an experiment's eligibility",
          async (_, { eligibilityRank, experimentId }) => {
            const experiment = await Experiment.findByPk(experimentId);
            if (experiment === null) {
              return false;
            }
            await experiment.update({ eligibilityRank });
            return true;
          },
        ),
      },
      updateExperimentName: {
        type: GraphQLBoolean,
        args: {
          experimentId: { type: GraphQLString },
          name: { type: GraphQLString },
        },
        resolve: requireAdmin(
          "You must be logged in as an admin to change an experiment's name",
          async (_, { experimentId, name }) => {
            const experiment = await Experiment.findByPk(experimentId);
            if (experiment === null) {
              return false;
            }
            await experiment.update({ name });
            return true;
          },
        ),
      },
      addTreeToExperiment: {
        type: GraphQLBoolean,
        args: {
          experimentId: { type: GraphQLString },
          treeId: { type: GraphQLString },
        },
        resolve: requireUser(
          "You must be logged in to add a tree to an experiment",
          async (_, { experimentId, treeId }) => {
            const tree = await Tree.findByPk(treeId);
            if (tree === null) {
              return false;
            }
            const experiment = await Experiment.findByPk(experimentId);
            if (experiment === null) {
              return false;
            }
            await experiment.$add("tree", tree);
            return true;
          },
        ),
      },
      removeTreeFromExperiment: {
        type: GraphQLBoolean,
        args: {
          experimentId: { type: GraphQLString },
          treeId: { type: GraphQLString },
        },
        resolve: requireUser(
          "You must be logged in to remove a tree from an experiment",
          async (_, { experimentId, treeId }) => {
            const tree = await Tree.findByPk(treeId);
            if (tree === null) {
              return false;
            }
            const experiment = await Experiment.findByPk(experimentId);
            if (experiment === null) {
              return false;
            }
            await experiment.$remove("tree", tree);
            return true;
          },
        ),
      },
      addOracleToTree: {
        type: GraphQLBoolean,
        args: {
          treeId: { type: GraphQLString },
          userId: { type: GraphQLString },
        },
        resolve: requireAdmin(
          "You must be logged in as an admin to add an oracle to a tree",
          async (_, { treeId, userId }) => {
            const tree = await Tree.findByPk(treeId);
            if (tree === null) {
              return false;
            }
            const user = await User.findByPk(userId);
            if (user === null) {
              return false;
            }
            await tree.$add("oracle", user);
            return true;
          },
        ),
      },
      updateMaliciousnessOfOracle: {
        type: GraphQLBoolean,
        args: {
          treeId: { type: GraphQLString },
          userId: { type: GraphQLString },
          isMalicious: { type: GraphQLBoolean },
        },
        resolve: requireAdmin(
          "You must be logged in as an admin to toggle the maliciousness of an oracle",
          async (_, { treeId, userId, isMalicious }) => {
            const oracleRelation = await UserTreeOracleRelation.findOne({
              where: {
                UserId: userId,
                TreeId: treeId,
              },
            });
            if (oracleRelation === null) {
              return false;
            }
            await oracleRelation.update({ isMalicious });
            return true;
          },
        ),
      },
      removeOracleFromTree: {
        type: GraphQLBoolean,
        args: {
          treeId: { type: GraphQLString },
          userId: { type: GraphQLString },
        },
        resolve: requireAdmin(
          "You must be logged in as an admin to remove an oracle from a tree",
          async (_, { treeId, userId }) => {
            const tree = await Tree.findByPk(treeId);
            if (tree === null) {
              return false;
            }
            const user = await User.findByPk(userId);
            if (user === null) {
              return false;
            }
            await tree.$remove("oracle", user);
            return true;
          },
        ),
      },
      addFallbackToExperiment: {
        type: GraphQLBoolean,
        args: {
          experimentId: { type: GraphQLString },
          fallbackId: { type: GraphQLString },
        },
        resolve: requireUser(
          "You must be logged in to add a fallback to an experiment",
          async (_, { experimentId, fallbackId }) => {
            const fallback = await Experiment.findByPk(fallbackId);
            if (fallback === null) {
              return false;
            }
            const experiment = await Experiment.findByPk(experimentId);
            if (experiment === null) {
              return false;
            }
            await experiment.$add("fallback", fallback);
            return true;
          },
        ),
      },
      removeFallbackFromExperiment: {
        type: GraphQLBoolean,
        args: {
          experimentId: { type: GraphQLString },
          fallbackId: { type: GraphQLString },
        },
        resolve: requireUser(
          "You must be logged in to remove a fallback from an experiment",
          async (_, { experimentId, fallbackId }) => {
            const fallback = await Experiment.findByPk(fallbackId);
            if (fallback === null) {
              return false;
            }
            const experiment = await Experiment.findByPk(experimentId);
            if (experiment === null) {
              return false;
            }
            await experiment.$remove("fallback", fallback);
            return true;
          },
        ),
      },
      updateWorkspaceChildren: {
        type: workspaceType,
        args: {
          id: { type: GraphQLString },
          childWorkspaceOrder: { type: new GraphQLList(GraphQLString) },
        },
        resolve: requireUser(
          "You must be logged in to update workspace children order",
          async (_, { id, childWorkspaceOrder }) => {
            const workspace = await Workspace.findByPk(id);
            if (workspace === null) {
              return null;
            }
            return workspace.update({ childWorkspaceOrder });
          },
        ),
      },
      updateWorkspaceIsStaleRelativeToUser: {
        type: workspaceType,
        args: {
          workspaceId: { type: GraphQLString },
          isStale: { type: GraphQLBoolean },
        },
        resolve: requireUser(
          "You must be logged in to update workspace children order",
          async (_, { workspaceId, isStale }, context) => {
            const workspace = await Workspace.findByPk(workspaceId);
            if (workspace === null) {
              return null;
            }
            const user = await userFromContext(context);
            const userId = user.user_id;

            let isNotStaleRelativeToUser = workspace.isNotStaleRelativeToUser;
            if (!isStale && isNotStaleRelativeToUser.indexOf(userId) === -1) {
              isNotStaleRelativeToUser.push(userId);
            }
            if (isStale && isNotStaleRelativeToUser.indexOf(userId) > -1) {
              isNotStaleRelativeToUser = isNotStaleRelativeToUser.filter(
                uId => uId !== userId,
              );
            }

            return await workspace.update({ isNotStaleRelativeToUser });
          },
        ),
      },
      declineToChallenge: {
        type: GraphQLBoolean,
        args: {
          id: { type: GraphQLString },
        },
        resolve: requireUser(
          "You must be logged in to decline to challenge a workspace",
          async (obj, { id, input }, context) => {
            const workspace = await Workspace.findByPk(id);
            if (workspace === null) {
              return false;
            }

            const parentWorkspace = await Workspace.findByPk(
              workspace.parentId,
            );
            if (parentWorkspace === null) {
              return false;
            }
            await parentWorkspace.update({ isCurrentlyResolved: true });
            if (parentWorkspace.parentId) {
              const grandParent = await Workspace.findByPk(
                parentWorkspace.parentId,
              );
              if (grandParent === null) {
                return false;
              }
              const children = (await grandParent.$get(
                "childWorkspaces",
              )) as Workspace[];
              let allResolvedOrArchived = true;
              for (const child of children) {
                if (!(child.isCurrentlyResolved || child.isArchived)) {
                  allResolvedOrArchived = false;
                  break;
                }
              }
              if (allResolvedOrArchived) {
                await grandParent.update({
                  isStale: true,
                  isNotStaleRelativeToUser: [],
                });
              }
            }

            return true;
          },
        ),
      },
      updateWorkspace: {
        type: workspaceType,
        args: {
          id: { type: GraphQLString },
          input: { type: WorkspaceInput },
        },
        resolve: requireUser(
          "You must be logged in to update a workspace",
          async (obj, { id, input }, context) => {
            const workspace = await Workspace.findByPk(id);
            if (workspace === null) {
              return null;
            }

            const inputWithNoNullOrUndefinedValues = _.omitBy(input, _.isNil);

            const isUserAttemptingToUpdateAtLeastOneField =
              Object.keys(inputWithNoNullOrUndefinedValues).length > 0;

            if (isUserAttemptingToUpdateAtLeastOneField) {
              const {
                isArchived,
                isCurrentlyResolved,
                isEligibleForHonestOracle,
                isEligibleForMaliciousOracle,
                isStale,
                wasAnsweredByOracle,
              } = inputWithNoNullOrUndefinedValues;

              const update = {
                isArchived,
                isEligibleForHonestOracle,
                isEligibleForMaliciousOracle,
                isStale,
                wasAnsweredByOracle,
              };

              const updateWithNoNullOrUndefinedValues = _.omitBy(
                update,
                _.isNil,
              );

              const updatedWorkspace = await workspace.update(
                updateWithNoNullOrUndefinedValues,
              );

              // is isStale updated to true
              // then is stale relative to all users as well
              if (!_.isNil(isStale) && isStale === true) {
                await workspace.update({ isNotStaleRelativeToUser: [] });
              }

              if (isCurrentlyResolved) {
                // determine isOracleExperiment
                const rootWorkspace = await workspace.getRootWorkspace();
                const tree = (await rootWorkspace.$get("tree")) as Tree;
                const experiments = (await tree.$get(
                  "experiments",
                )) as Experiment[];
                const experiment = experiments[0];
                const isOracleExperiment =
                  experiment && experiment.areNewWorkspacesOracleOnlyByDefault;

                if (!isOracleExperiment || workspace.isRequestingLazyUnlock) {
                  const updatedWorkspace = await workspace.update({
                    isCurrentlyResolved,
                  });

                  // if is currently resolved updated to true
                  // and workspace has parent, then
                  // if parent workspace has all children resolved
                  // then mark parent workspace as not stale
                  if (updatedWorkspace.parentId) {
                    const parent = await Workspace.findByPk(
                      updatedWorkspace.parentId,
                    );
                    if (parent === null) {
                      return;
                    }
                    const children = (await parent.$get(
                      "childWorkspaces",
                    )) as Workspace[];
                    let allResolvedOrArchived = true;
                    for (const child of children) {
                      if (!(child.isCurrentlyResolved || child.isArchived)) {
                        allResolvedOrArchived = false;
                        break;
                      }
                    }
                    if (allResolvedOrArchived) {
                      await parent.update({
                        isStale: true,
                        isNotStaleRelativeToUser: [],
                      });
                    }
                  }
                }

                if (isOracleExperiment && !workspace.isRequestingLazyUnlock) {
                  if (
                    !workspace.isEligibleForHonestOracle &&
                    !workspace.isEligibleForMaliciousOracle &&
                    workspace.parentId
                  ) {
                    const parentWorkspace = await Workspace.findByPk(
                      workspace.parentId,
                    );
                    if (parentWorkspace === null) {
                      return null;
                    }

                    if (parentWorkspace.parentId) {
                      const grandparentWorkspace = await Workspace.findByPk(
                        parentWorkspace.parentId,
                      );
                      if (grandparentWorkspace === null) {
                        return null;
                      }
                      await grandparentWorkspace.update({
                        isCurrentlyResolved,
                      });
                      if (grandparentWorkspace.parentId) {
                        const greatGrandparentWorkspace = await Workspace.findByPk(
                          grandparentWorkspace.parentId,
                        );
                        if (greatGrandparentWorkspace === null) {
                          return null;
                        }
                        const isNotRoot = greatGrandparentWorkspace.parentId;
                        if (isNotRoot) {
                          const children = (await greatGrandparentWorkspace.$get(
                            "childWorkspaces",
                          )) as Workspace[];
                          let allResolvedOrArchived = true;
                          for (const child of children) {
                            if (
                              !(child.isCurrentlyResolved || child.isArchived)
                            ) {
                              allResolvedOrArchived = false;
                              break;
                            }
                          }
                          if (allResolvedOrArchived) {
                            await greatGrandparentWorkspace.update({
                              isStale: true,
                              isNotStaleRelativeToUser: [],
                            });
                          }
                        }
                      }
                    }
                  }
                }

                // if in oracle workspace and typical user, propagate isCurrentlyResolved up through oracles
              }

              return updatedWorkspace;
            }

            return workspace;
          },
        ),
      },
      updateWorkspaceWasAnsweredByOracle: {
        type: workspaceType,
        args: {
          id: { type: GraphQLString },
          wasAnsweredByOracle: { type: GraphQLBoolean },
        },
        resolve: async (_, { id, wasAnsweredByOracle }) => {
          const workspace = await Workspace.findByPk(id);
          if (workspace === null) {
            return null;
          }
          return workspace.update({ wasAnsweredByOracle });
        },
      },
      transferRemainingBudgetToParent: {
        type: workspaceType,
        args: {
          id: { type: GraphQLString },
        },
        resolve: requireUser(
          "You must be logged in to transfer remaining budget to parent",
          async (_, { id }) => {
            const child = await Workspace.findByPk(id);
            if (child === null) {
              return;
            }
            const childRemainingBudget =
              child.totalBudget - child.allocatedBudget;
            const parent = await Workspace.findByPk(child.parentId);
            if (parent === null) {
              return;
            }
            await parent.update({
              isStale: true,
              isNotStaleRelativeToUser: [],
              allocatedBudget: parent.allocatedBudget - childRemainingBudget,
            });
            await child.update({ totalBudget: child.allocatedBudget });
          },
        ),
      },
      depleteBudget: {
        type: workspaceType,
        args: {
          id: { type: GraphQLString },
        },
        resolve: async (_, { id }) => {
          const workspace = await Workspace.findByPk(id);
          if (workspace === null) {
            return;
          }
          await workspace.update({ allocatedBudget: workspace.totalBudget });
        },
      },
      createWorkspace: {
        type: workspaceType,
        args: {
          question: { type: GraphQLJSON },
          totalBudget: { type: GraphQLInt },
          experimentId: { type: GraphQLString },
        },
        resolve: requireUser(
          "You must be logged in to create a workspace",
          async (_, { question, totalBudget, experimentId }, context) => {
            const user = await userFromContext(context);

            let workspace;

            if (experimentId) {
              const experiment = await Experiment.findByPk(experimentId);
              if (experiment === null) {
                return;
              }

              workspace = await Workspace.create(
                {
                  totalBudget,
                  creatorId: user.user_id,
                  isEligibleForMaliciousOracle:
                    experiment.areNewWorkspacesOracleOnlyByDefault,
                }, // TODO replace user.user_id
                { questionValue: JSON.parse(question) },
              );

              const tree = await Tree.create({
                rootWorkspaceId: workspace.id,
              });

              await experiment.$add("tree", tree);
            } else {
              workspace = await Workspace.create(
                {
                  totalBudget,
                  creatorId: user.user_id,
                }, // TODO replace user.user_id
                { questionValue: JSON.parse(question) },
              );
            }

            return workspace;
          },
        ),
      },
      createChildWorkspace: {
        type: workspaceType,
        args: {
          workspaceId: { type: GraphQLString },
          question: { type: GraphQLJSON },
          totalBudget: { type: GraphQLInt },
        },
        resolve: requireUser(
          "You must be logged in to create a subquestion",
          async (_, { workspaceId, question, totalBudget }, context) => {
            const workspace = await Workspace.findByPk(workspaceId);
            if (workspace === null) {
              return;
            }
            const user = await userFromContext(context);

            return await workspace.createChild({
              question: JSON.parse(question),
              totalBudget,
              creatorId: user.user_id,
              isPublic: isUserAdmin(user),
            });
          },
        ),
      },
      updateChildTotalBudget: {
        type: workspaceType,
        args: {
          workspaceId: { type: GraphQLString },
          childId: { type: GraphQLString },
          totalBudget: { type: GraphQLInt },
        },
        resolve: requireUser(
          "You must be logged in to update a child's total budget",
          async (_, { workspaceId, childId, totalBudget }, context) => {
            const workspace = await Workspace.findByPk(workspaceId);
            if (workspace === null) {
              return;
            }
            const child = await Workspace.findByPk(childId);
            await workspace.changeAllocationToChild(child, totalBudget);
          },
        ),
      },
      findNextWorkspace: {
        type: workspaceType,
        args: {
          experimentId: { type: GraphQLString },
        },
        resolve: async (_, { experimentId }, context) => {
          const user = await userFromContext(context);
          if (user == null) {
            throw new Error(
              "No user found when attempting get next workspace.",
            );
          }

          let scheduler;
          if (schedulers.has(experimentId)) {
            scheduler = schedulers.get(experimentId);
          } else {
            scheduler = await createScheduler(experimentId);
          }

          const workspaceId = await scheduler.assignNextWorkspace(user.user_id);

          return { id: workspaceId };
        },
      },
      findNextMaybeSuboptimalWorkspace: {
        type: workspaceType,
        args: {
          experimentId: { type: GraphQLString },
        },
        resolve: async (_, { experimentId }, context) => {
          const user = await userFromContext(context);
          if (user == null) {
            throw new Error(
              "No user found when attempting get next workspace.",
            );
          }

          let scheduler;
          if (schedulers.has(experimentId)) {
            scheduler = schedulers.get(experimentId);
          } else {
            scheduler = await createScheduler(experimentId);
          }

          const workspaceId = await scheduler.assignNextMaybeSuboptimalWorkspace(
            user.user_id,
          );

          return { id: workspaceId };
        },
      },
      leaveCurrentWorkspace: {
        type: GraphQLBoolean,
        args: {
          experimentId: { type: GraphQLString },
        },
        resolve: requireUser(
          "You must be logged in to leave a workspace",
          async (_, { experimentId }, context) => {
            const user = await userFromContext(context);
            let scheduler;
            if (schedulers.has(experimentId)) {
              scheduler = schedulers.get(experimentId);
            } else {
              scheduler = await createScheduler(experimentId);
            }
            await scheduler.leaveCurrentWorkspace(user.user_id);
            return true;
          },
        ),
      },
      ejectUserFromCurrentWorkspace: {
        type: GraphQLBoolean,
        args: {
          userId: { type: GraphQLString },
          workspaceId: { type: GraphQLString },
        },
        resolve: requireAdmin(
          "You must be logged in as an admin to eject a user from a workspace",
          async (_, { userId, workspaceId }, context) => {
            let curWorkspace = await Workspace.findByPk(workspaceId);
            if (curWorkspace === null) {
              return false;
            }
            while (curWorkspace.parentId) {
              curWorkspace = await Workspace.findByPk(curWorkspace.parentId);
              if (curWorkspace === null) {
                return false;
              }
            }

            const rootWorkspace = curWorkspace;

            const tree = (await rootWorkspace.$get("tree")) as Tree;

            const experiments = (await tree.$get(
              "experiments",
            )) as Experiment[];
            const experiment = experiments[0];
            const experimentId = experiment.id;

            let scheduler;
            if (schedulers.has(experimentId)) {
              scheduler = schedulers.get(experimentId);
            } else {
              scheduler = await createScheduler(experimentId);
            }

            // have this guard here in case user has already left this particular workspace
            // and is working on a different one
            if (
              scheduler.isUserCurrentlyWorkingOnWorkspace(userId, workspaceId)
            ) {
              await scheduler.leaveCurrentWorkspace(userId);
            }

            return true;
          },
        ),
      },
      updateWorkspaceIsPublic: {
        type: workspaceType,
        args: {
          isPublic: { type: GraphQLBoolean },
          workspaceId: { type: GraphQLString },
        },
        resolve: requireAdmin(
          "You must be logged in as an admin to edit a workspace's front page status",
          async (_, { isPublic, workspaceId }, context) => {
            const workspace = await Workspace.findByPk(workspaceId);
            if (workspace === null) {
              return;
            }
            await workspace.update({ isPublic });
          },
        ),
      },
      updateWorkspaceIsEligible: {
        type: workspaceType,
        args: {
          isEligibleForAssignment: { type: GraphQLBoolean },
          workspaceId: { type: GraphQLString },
        },
        resolve: requireUser(
          "You must be logged in to update a workspace's eligibility",
          async (_, { isEligibleForAssignment, workspaceId }, context) => {
            const workspace = await Workspace.findByPk(workspaceId);
            if (workspace === null) {
              return;
            }
            await workspace.update({ isEligibleForAssignment });
            return { id: workspaceId };
          },
        ),
      },
      updateWorkspaceHasTimeBudget: {
        type: workspaceType,
        args: {
          hasTimeBudget: { type: GraphQLBoolean },
          workspaceId: { type: GraphQLString },
        },
        resolve: requireAdmin(
          "You must be logged in as an admin to edit a workspace's time budget status",
          async (_, { hasTimeBudget, workspaceId }, context) => {
            const workspace = await Workspace.findByPk(workspaceId);
            if (workspace === null) {
              return;
            }
            await workspace.update({ hasTimeBudget });
            return { id: workspaceId };
          },
        ),
      },
      updateWorkspaceHasIOConstraints: {
        type: workspaceType,
        args: {
          hasIOConstraints: { type: GraphQLBoolean },
          workspaceId: { type: GraphQLString },
        },
        resolve: requireAdmin(
          "You must be logged in as an admin to edit a workspace's i/o constraint status",
          async (_, { hasIOConstraints, workspaceId }, context) => {
            const workspace = await Workspace.findByPk(workspaceId);
            if (workspace === null) {
              return;
            }
            await workspace.update({ hasIOConstraints });
            return { id: workspaceId };
          },
        ),
      },
      updateWorkspaceIsEligibleForOracle: {
        type: workspaceType,
        args: {
          isEligibleForHonestOracle: { type: GraphQLBoolean },
          workspaceId: { type: GraphQLString },
        },
        resolve: requireUser(
          "You must be logged in to update a workspace's oracle eligibility",
          async (_, { isEligibleForHonestOracle, workspaceId }, context) => {
            const workspace = await Workspace.findByPk(workspaceId);
            if (workspace === null) {
              return;
            }
            await workspace.update({ isEligibleForHonestOracle });
          },
        ),
      },
      updateAllocatedBudget: {
        type: workspaceType,
        args: {
          workspaceId: { type: GraphQLString },
          changeToBudget: { type: GraphQLInt },
        },
        resolve: requireUser(
          "You must be logged in to update a workspace's allocated budget",
          async (_, { workspaceId, changeToBudget }, context) => {
            const workspace = await Workspace.findByPk(workspaceId);
            if (workspace === null) {
              return;
            }
            const updatedTimeBudget = Math.min(
              workspace.totalBudget,
              workspace.allocatedBudget + changeToBudget,
            );
            await workspace.update({ allocatedBudget: updatedTimeBudget });
          },
        ),
      },
      updateTimeSpentOnWorkspace: {
        type: GraphQLBoolean,
        args: {
          doesAffectAllocatedBudget: { type: GraphQLBoolean },
          workspaceId: { type: GraphQLString },
          secondsSpent: { type: GraphQLInt },
        },
        resolve: requireUser(
          "You must be logged in to update the time spent on a workspace",
          async (
            _,
            { doesAffectAllocatedBudget, workspaceId, secondsSpent },
            context,
          ) => {
            const workspace = await Workspace.findByPk(workspaceId);
            if (workspace === null) {
              return false;
            }

            if (doesAffectAllocatedBudget) {
              const updatedTimeBudget = Math.min(
                workspace.totalBudget,
                workspace.allocatedBudget + secondsSpent,
              );

              await workspace.update({
                allocatedBudget: updatedTimeBudget,
                timeSpentOnThisWorkspace:
                  workspace.timeSpentOnThisWorkspace + secondsSpent,
              });
            } else {
              await workspace.update({
                timeSpentOnThisWorkspace:
                  workspace.timeSpentOnThisWorkspace + secondsSpent,
              });
            }

            return true;
          },
        ),
      },
      updateExperimentMetadata: {
        type: GraphQLBoolean,
        args: {
          experimentId: { type: GraphQLString },
          metadata: { type: GraphQLString },
        },
        resolve: requireAdmin(
          "You must be logged in as an admin to update experiment metadata",
          async (_, { experimentId, metadata }, context) => {
            const experiment = await Experiment.findByPk(experimentId);
            if (experiment === null) {
              return false;
            }
            await experiment.update({ metadata: JSON.parse(metadata) });
            return true;
          },
        ),
      },
      updateExperimentInstructions: {
        type: GraphQLBoolean,
        args: {
          experimentId: { type: GraphQLString },
          instructions: { type: GraphQLString },
          type: { type: instructionsEnumType },
        },
        resolve: requireAdmin(
          "You must be logged in as an admin to update experiment instructions",
          async (_, { experimentId, instructions, type }, context) => {
            const [instruction, created] = await Instructions.findOrBuild({
              where: { experimentId, type },
            });
            instruction.value = instructions;
            await instruction.save();
            return true;
          },
        ),
      },
      updateExperimentDefaultOracle: {
        type: GraphQLBoolean,
        args: {
          experimentId: { type: GraphQLString },
          defaultOracle: { type: GraphQLBoolean },
        },
        resolve: requireAdmin(
          "You must be logged in as an admin to update experiment metadata",
          async (_, { experimentId, defaultOracle }, context) => {
            const experiment = await Experiment.findByPk(experimentId);
            if (experiment === null) {
              return false;
            }
            await experiment.update({
              areNewWorkspacesOracleOnlyByDefault: defaultOracle,
            });
            return true;
          },
        ),
      },
      markWorkspaceStaleForUser: {
        type: GraphQLBoolean,
        args: {
          userId: { type: GraphQLString },
          workspaceId: { type: GraphQLString },
        },
        resolve: requireAdmin(
          "You must be logged in as an admin to mark a workspace stale for a user",
          async (_, { userId, workspaceId }, context) => {
            const workspace = await Workspace.findByPk(workspaceId);
            if (workspace === null) {
              return false;
            }

            const isNotStaleRelativeToUser = workspace.isNotStaleRelativeToUser.filter(
              uId => uId !== userId,
            );

            await workspace.update({ isNotStaleRelativeToUser });

            return true;
          },
        ),
      },
      unlockPointer: {
        type: GraphQLBoolean,
        args: {
          pointerId: { type: GraphQLString },
          workspaceId: { type: GraphQLString },
        },
        resolve: requireUser(
          "You must be logged in to unlock a pointer",
          async (_, { pointerId, workspaceId }, context) => {
            const exportWorkspaceLockRelation = await ExportWorkspaceLockRelation.findOne(
              {
                where: {
                  pointerId,
                  workspaceId,
                },
              },
            );

            if (exportWorkspaceLockRelation) {
              await exportWorkspaceLockRelation.update({ isLocked: false });
            } else {
              await ExportWorkspaceLockRelation.create({
                isLocked: false,
                pointerId,
                workspaceId,
              });
            }

            return true;
          },
        ), // unlock pointer resolver
      }, // unlockPointer mutation
    }, // mutation fields
  }), // mutation: new GraphQLObjectType({...})
}); // const schema = new GraphQLSchema({...})

export { schema };
