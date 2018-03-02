var models = require('../models');
import * as _ from 'lodash';
import { resolver, attributeFields } from 'graphql-sequelize';
import { GraphQLObjectType, GraphQLNonNull, GraphQLFloat, GraphQLList, GraphQLSchema, GraphQLInt, GraphQLString, GraphQLInputObjectType } from 'graphql';
import * as aasync from "async";
import * as pluralize from "pluralize";
import * as Case from "Case";

const generateReferences = (model, references) => {
  let all = {};
  references.map(r => {
    all[r[0]] = {
      type: r[1](),
      resolve: resolver(model[r[2]])
    }
  })
  return all
}

const makeObjectType = (model, references) => (
  new GraphQLObjectType({
    name: model.name,
    description: model.name,
    fields: () => _.assign(attributeFields(model), generateReferences(model, references))
  })
)

let standardReferences = [
  ['createdAtEvent', () => eventType, 'CreatedAtEvent'],
  ['updatedAtEvent', () => eventType, 'UpdatedAtEvent'],
]

let blockType = makeObjectType(models.Block,
  [
    ...standardReferences,
    ['workspace', () => workspaceType, 'Workspace'],
  ]
)

let workspaceType = makeObjectType(models.Workspace,
  [
    ...standardReferences,
    ['blocks', () => new GraphQLList(blockType), 'Blocks'],
  ]
)

let eventType = makeObjectType(models.Event,[])

let pointerType = makeObjectType(models.Pointer,
  [
    ...standardReferences,
    ['pointerImport', () => pointerImportType, 'PointerImport']
    ['sourceBlock', () => blockType, 'SourceBlock'],
  ]
)

let pointerImportType = makeObjectType(models.PointerImport,
  [
    ...standardReferences,
    ['workspace', () => blockType, 'Workspace'],
    ['pointer', () => pointerType, 'Pointer'],
  ]
)

const BlockInput = new GraphQLInputObjectType({
  name: "blockInput",
  fields: _.pick(attributeFields(models.Block), 'value', 'id'),
})

let schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'RootQueryType',
    fields: {
      workspaces: {
        type: new GraphQLList(workspaceType),
        resolve: resolver(models.Workspace)
      }
    }
  }),
  mutation: new GraphQLObjectType({
    name: 'RootMutationType',
    fields : {
      updateBlocks: {
        type: workspaceType,
        args: {workspaceId: {type: GraphQLString}, blocks: {type: new GraphQLList(BlockInput)}},
        resolve: async (_, {workspaceId, blocks}) => {
          for (const _block of blocks){
            const block = models.Workspace.findById(_blocks.id)
            block.update({_block})
          }
        }
      },
      updateWorkspace: {
        type: workspaceType,
        args: {workspaceId: {type: GraphQLString}, childWorkspaceOrder: {type: new GraphQLList(GraphQLString)}},
        resolve: async (_, {workspaceId, childWorkspaceOrder}) => {
          const workspace = await models.Workspace.findById(workspaceId)
          return workspace.update({childWorkspaceOrder})
        }
      },
      createChildWorkspace: {
        type: workspaceType,
        args: {workspaceId: {type: GraphQLString}},
        resolve: async(_, {workspaceId}) => {
          const workspace = await models.Workspace.findById(workspaceId)
          const child = await workspace.createChild(); 
          return child
        }
      },
    }
  })
});

export {schema};