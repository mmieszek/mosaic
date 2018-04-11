import * as chai from "chai";
const { expect } = chai;
import { truncateDb } from "../../testHelpers/sequelizeHelpers";
import { createRootWorkspace } from "../../testHelpers/graphQLCalls";
import WorkspaceModel from "../../../lib/models/workspace";
import * as models from "../../../lib/models";

describe('WorkspaceModel', () => {
    describe('subtreeWorkspaces', () => {
        beforeEach(() => truncateDb());
        
        // a lame test, but just wanted to get something working quickly
        // to show the testing pattern.
        it('should not return anything if there are no subtree workspaces', async () => {
            const rootWorkspace = await createRootWorkspace();
            const workspace = await models.Workspace.findById(rootWorkspace.data.createWorkspace.id);
            const subtreeWorkspaces = await workspace.subtreeWorkspaces();
            expect(subtreeWorkspaces).to.be.empty;
        });
    });
})