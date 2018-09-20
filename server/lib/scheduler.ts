import { filter, map } from "asyncro";
import * as models from "./models";

class Scheduler {
  private schedule = {};

  public async getCurrentWorkspace(userId) {
    const userSchedule = this.schedule[userId];
    if (!userSchedule) return null;
    const lastAssignment = userSchedule.slice(-1)[0];
    return lastAssignment.workspaceId;
  }

  public async findNextWorkspace(userId) {
    if (!this.schedule[userId]) {
      this.schedule[userId] = [];
    }

    const userSchedule = this.schedule[userId];

    const allWorkspaces = await models.Workspace.findAll({
      attributes: ["id", "parentId", "childWorkspaceOrder"] // virtual attrs added anyway, see: https://github.com/sequelize/sequelize/issues/5566
    });

    const workspacesInTreeWorkedOnLeastRecently = await filter(
      allWorkspaces,
      async (w) => await this.isInTreeUserHasWorkedOnLeastRecently(userSchedule, allWorkspaces, w.id)
    );

    const notYetWorkedOnInThatTree = await filter(
      workspacesInTreeWorkedOnLeastRecently,
      async (w) => await this.hasNotBeenWorkedOnYet(w)
    );

    let finalWorkspaces = notYetWorkedOnInThatTree;

    if (finalWorkspaces.length === 0) {
      finalWorkspaces = await filter(
        workspacesInTreeWorkedOnLeastRecently,
        async (w) => await this.hasRemainingBudgetForChildren(w)
      );
    }

    if (finalWorkspaces.length === 0) {
      let workspaceWorkedOnLeastRecently;
      let whenThisWorkspaceWasWorkedOn;

      finalWorkspaces = await map(
        workspacesInTreeWorkedOnLeastRecently,
        async (w) => {
          const lastWorkedOnTimestamp = await this.getTimestampWorkspaceLastWorkedOn(w);
          if (!workspaceWorkedOnLeastRecently || lastWorkedOnTimestamp < whenThisWorkspaceWasWorkedOn) {
            workspaceWorkedOnLeastRecently = w;
            whenThisWorkspaceWasWorkedOn = lastWorkedOnTimestamp;
          }
        }
      );

      finalWorkspaces = [workspaceWorkedOnLeastRecently];
    }

    this.schedule[userId] = userSchedule.concat({
      startedAt: Date.now(),
      workspaceId: finalWorkspaces[0].id,
    });
  }

  private async getTreesUserHasWorkedOnLeastRecently(userSchedule, allWorkspaces) {
    const data = {}; // maps rootWorkspaceIds to array #

    // initialize at -1
    for (let i = 0; i < allWorkspaces.length; i++) {
      const workspace = allWorkspaces[i];
      const rootParentWorkspace = await this.getRootParentOfWorkspace(workspace);
      data[rootParentWorkspace.id] = -1;
    }

    // go through user schedule and update
    for (let i = 0; i < userSchedule.length; i++) {
      const workspaceId = userSchedule[i].workspaceId;
      const workspace = await models.Workspace.findById(workspaceId, { attributes: ["id"]});
      const rootParentWorkspace = await this.getRootParentOfWorkspace(workspace);
      data[rootParentWorkspace.id] = i;
    }

    // get smallest index
    let smallestIndex = Infinity;
    for (const workspaceId in data) {
      if (data.hasOwnProperty(workspaceId)) {
        smallestIndex = Math.min(smallestIndex, data[workspaceId]);
      }
    }

    // collect rootWorkspaceIds with this index
    const leastRecentlyWorkedOnTrees = [];
    for (const workspaceId in data) {
      if (data.hasOwnProperty(workspaceId)) {
        if (data[workspaceId] === smallestIndex)
        leastRecentlyWorkedOnTrees.push(workspaceId);
      }
    }

    return leastRecentlyWorkedOnTrees;
  }

  private rootParentCache = new Map;

  private async getRootParentOfWorkspace(workspace) {
    if (this.rootParentCache.has(workspace)) {
      return this.rootParentCache.get(workspace);
    }

    let curWorkspace = workspace;

    while (curWorkspace.parentId) {
      curWorkspace = await workspace.getParentWorkspace();
    }

    const rootParentWorkspace = curWorkspace;

    this.rootParentCache.set(workspace, rootParentWorkspace);

    return rootParentWorkspace;
  }

  private async isInTreeUserHasWorkedOnLeastRecently(userSchedule, allWorkspaces, workspaceId) {
    const leastRecentlyWorkedOnTrees = await this.getTreesUserHasWorkedOnLeastRecently(userSchedule, allWorkspaces);
    const workspace = await models.Workspace.findById(workspaceId, { attributes: ["id"]});
    const rootParentWorkspace = await this.getRootParentOfWorkspace(workspace);

    return leastRecentlyWorkedOnTrees.find(id => id === rootParentWorkspace.id);
  }

  private async hasNotBeenWorkedOnYet(workspace) {
    for (const userId in this.schedule) {
      if (this.schedule.hasOwnProperty(userId)) {
        for (const assignment of this.schedule[userId]) {
          if (assignment.workspaceId === workspace.id) {
            return false;
          }
        }
      }
    }

    return true;
  }

  private async hasRemainingBudgetForChildren(workspace) {
    return workspace.totalBudget > workspace.allocatedBudget;
  }

  private async getTimestampWorkspaceLastWorkedOn(workspace) {
    let lastWorkedOnTimestamp = -Infinity;

    for (const userId in this.schedule) {
      if (this.schedule.hasOwnProperty(userId)) {
        for (const assignment of this.schedule[userId]) {
          if (assignment.workspaceId === workspace.id) {
            if (assignment.startedAt > lastWorkedOnTimestamp) {
              lastWorkedOnTimestamp = assignment.startedAt;
            }
          }
        }
      }
    }

    return lastWorkedOnTimestamp;
  }
}

const scheduler = new Scheduler();

export { scheduler };
