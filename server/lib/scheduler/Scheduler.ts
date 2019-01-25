import { filter, map } from "asyncro";
import * as _ from "lodash";
import { pickRandomItemFromArray } from "../utils/pickRandomItemFromArray";

class Scheduler {
  private fetchAllWorkspacesInTree;
  private fetchAllRootWorkspaces;
  private isInOracleMode;
  private numberOfStaleDescendantsCache;
  private NumberOfStaleDescendantsCache;
  private remainingBudgetAmongDescendantsCache;
  private RemainingBudgetAmongDescendantsCache;
  private rootParentCache;
  private schedule;
  private timeLimit;

  public constructor({
    fetchAllWorkspacesInTree,
    fetchAllRootWorkspaces,
    isInOracleMode,
    NumberOfStaleDescendantsCache,
    RemainingBudgetAmongDescendantsCache,
    rootParentCache,
    schedule,
    timeLimit,
  }) {
    this.fetchAllWorkspacesInTree = fetchAllWorkspacesInTree;
    this.fetchAllRootWorkspaces = fetchAllRootWorkspaces;
    this.isInOracleMode = isInOracleMode;
    this.NumberOfStaleDescendantsCache = NumberOfStaleDescendantsCache;
    this.RemainingBudgetAmongDescendantsCache = RemainingBudgetAmongDescendantsCache;
    this.rootParentCache = rootParentCache;
    this.schedule = schedule;
    this.timeLimit = timeLimit;
  }

  public async getUserActivity(userId) {
    return this.schedule.getUserActivity(userId);
  }

  public async getIdOfCurrentWorkspace(userId) {
    const assignment = this.schedule.getMostRecentAssignmentForUser(userId);

    if (!assignment) {
      return undefined;
    }

    const workspace = assignment.getWorkspace();

    return workspace.id;
  }

  public async assignNextWorkspaceForOracle(userId) {
    this.resetCaches();

    let treesToConsider = await this.fetchAllRootWorkspaces();
    let wasWorkspaceAssigned = false;

    while (treesToConsider.length > 0) {
      const leastRecentlyWorkedOnTreesToConsider = await this.getTreesWorkedOnLeastRecentlyByUser(userId, treesToConsider);
      const randomlySelectedTree = pickRandomItemFromArray(leastRecentlyWorkedOnTreesToConsider);

      const workspacesInTree = await this.fetchAllWorkspacesInTree(randomlySelectedTree);

      const oracleEligibleWorkspaces = await filter(
        workspacesInTree,
        async w => {
          if (w.isEligibleForOracle && !w.wasAnsweredByOracle) {
            const hasAncestorAnsweredByOracle = await w.hasAncestorAnsweredByOracle;
            return !hasAncestorAnsweredByOracle;
          }
          return false;
        }
      );

      const workspacesToConsider = await this.filterByWhetherCurrentlyBeingWorkedOn(oracleEligibleWorkspaces);

      // we want to prioritize older workspaces
      workspacesToConsider.sort((w1, w2) => w1 - w2);

      const assignedWorkspace = workspacesToConsider[0];

      if (!assignedWorkspace) {
        treesToConsider = _.difference(
          treesToConsider,
          [randomlySelectedTree]
        );
      } else {
        await this.schedule.assignWorkspaceToUser({
          userId,
          workspace: assignedWorkspace,
          isOracle: true,
          isLastAssignmentTimed: true,
        });
        wasWorkspaceAssigned = true;
        break;
      }
    }

    if (!wasWorkspaceAssigned) {
      this.schedule.leaveCurrentWorkspace(userId);
      throw new Error("No eligible workspace for oracle");
    }
  }

  public async assignNextWorkspace(userId, maybeSuboptimal = false) {
    this.resetCaches();

    let actionableWorkspaces = await this.getActionableWorkspaces({ maybeSuboptimal, userId });

    if (actionableWorkspaces.length === 0) {
      actionableWorkspaces = await this.getActionableWorkspaces({
        maybeSuboptimal, 
        userId,
      });
    }

    if (actionableWorkspaces.length === 0) {
      this.schedule.leaveCurrentWorkspace(userId);
      throw new Error("No eligible workspace");
    }

    const assignedWorkspace = pickRandomItemFromArray(actionableWorkspaces);
    const isThisAssignmentTimed = await assignedWorkspace.hasTimeBudgetOfRootParent;

    await this.schedule.assignWorkspaceToUser({
      userId,
      workspace: assignedWorkspace,
      isOracle: false,
      isLastAssignmentTimed: isThisAssignmentTimed,
    });
  }

  public async assignNextMaybeSuboptimalWorkspace(userId) {
    await this.assignNextWorkspace(userId, true);
  }

  public leaveCurrentWorkspace(userId) {
    this.schedule.leaveCurrentWorkspace(userId);
  }

  public reset(){
    this.schedule.reset();
  }

  private async getActionableWorkspaces({ 
    maybeSuboptimal, 
    userId,
  }) {
     let treesToConsider = await this.fetchAllRootWorkspaces();

    while (treesToConsider.length > 0) {
      const leastRecentlyWorkedOnTreesToConsider = await this.getTreesWorkedOnLeastRecentlyByUser(userId, treesToConsider);
      const randomlySelectedTree = pickRandomItemFromArray(leastRecentlyWorkedOnTreesToConsider);
      const actionableWorkspaces = await this.getActionableWorkspacesForTree({
        maybeSuboptimal,
        rootWorkspace: randomlySelectedTree,
        userId,
      });

      if (actionableWorkspaces.length > 0) {
        return actionableWorkspaces;
      } else {
        treesToConsider = _.difference(
          treesToConsider,
          [randomlySelectedTree]
        );
      }
    }

    // if you've made it here, then you've looked through each tree for actionable
    // workspaces, and each time found none
    return [];
  }

  private async getActionableWorkspacesForTree({
    maybeSuboptimal,
    rootWorkspace,
    userId,
  }) {
    let workspacesInTree = await this.fetchAllWorkspacesInTree(rootWorkspace);

    if (this.isInOracleMode.getValue()) {
      workspacesInTree = await filter(
        workspacesInTree,
        async w => {
          if (!w.isEligibleForOracle && !w.wasAnsweredByOracle) {
            const hasAncestorAnsweredByOracle = await w.hasAncestorAnsweredByOracle;
            return !hasAncestorAnsweredByOracle;
          }
          return false;
        }
      );
    }

    const workspacesNotCurrentlyBeingWorkedOn = await this.filterByWhetherCurrentlyBeingWorkedOn(workspacesInTree);

    let workspacesWithAtLeastMinBudget = workspacesNotCurrentlyBeingWorkedOn;
    if (rootWorkspace.hasTimeBudget) {
      workspacesWithAtLeastMinBudget = await this.filterByWhetherHasMinBudget(workspacesNotCurrentlyBeingWorkedOn);
    }

    let eligibleWorkspaces = workspacesWithAtLeastMinBudget;

    const staleWorkspaces = await this.filterByStaleness(workspacesWithAtLeastMinBudget);

    eligibleWorkspaces = staleWorkspaces;
    
    const workspacesExceedingDistCuoff = await this.getWorkspacesExceedingMinDistFromWorkedOnWorkspace({
      minDist: maybeSuboptimal ? 1 : 2,
      userId,
      workspaces: eligibleWorkspaces,
      workspacesInTree,
    });

    let workspaceWithLeastRequiredWorkAmongDescendants = workspacesExceedingDistCuoff;
    if (rootWorkspace.hasTimeBudget) {
      workspaceWithLeastRequiredWorkAmongDescendants = await this.getWorkspacesWithLeastRemainingBugetAmongDescendants(workspacesExceedingDistCuoff);
    } else if (rootWorkspace.hasIOConstraints) {
      workspaceWithLeastRequiredWorkAmongDescendants = await this.getWorkspacesWithFewestStaleDescendants(workspacesExceedingDistCuoff);
    }

    const workspacesWithMostDistFromWorkedOnWorkspace = this.getWorkspacesWithMostDistFromWorkedOnWorkspace({
      shouldResetCache: false,
      userId,
      workspaces: workspaceWithLeastRequiredWorkAmongDescendants,
      workspacesInTree,
    });

    const finalWorkspaces = workspacesWithMostDistFromWorkedOnWorkspace;

    return finalWorkspaces;
  }

  private async filterByStaleness(workspaces) {
    return await filter(
      workspaces,
      async w => await w.isStale
    );
  }

  private async getWorkspacesWithLeastRemainingBugetAmongDescendants(workspaces) {
    const workspacesWithRemainingDescendantBudget = await map(
      workspaces,
      async w => {
        const remainingBudgetAmongDescendants = await this.remainingBudgetAmongDescendantsCache.getRemainingBudgetAmongDescendants(w);

        return {
            remainingBudgetAmongDescendants,
            workspace: w,
        };
      }
    );

    const minLeastRemainingBudgetAmongDescendants = _.min(
      workspacesWithRemainingDescendantBudget.map(o => o.remainingBudgetAmongDescendants)
    );

    const workspacesToReturn = workspacesWithRemainingDescendantBudget
      .filter(o => o.remainingBudgetAmongDescendants === minLeastRemainingBudgetAmongDescendants)
      .map(o => o.workspace);

    return workspacesToReturn;
  }

  private async getWorkspacesWithFewestStaleDescendants(workspaces) {
    const workspacesWithNumberOfStaleDescendants = await map(
      workspaces,
      async w => {
        const numberOfStaleDescendants = await this.numberOfStaleDescendantsCache.getNumberOfStaleDescendants(w);

        return {
            numberOfStaleDescendants,
            workspace: w,
        };
      }
    );

    const minNumberOfStaleDescendants = _.min(
      workspacesWithNumberOfStaleDescendants.map(o => o.numberOfStaleDescendants)
    );

    const workspacesToReturn = workspacesWithNumberOfStaleDescendants
      .filter(o => o.numberOfStaleDescendants === minNumberOfStaleDescendants)
      .map(o => o.workspace);

    return workspacesToReturn;
  }

  private async getTreesWorkedOnLeastRecentlyByUser(userId, rootWorkspaces) {
    const treesWorkedOnLeastRecentlyByUser = this.schedule.getTreesWorkedOnLeastRecentlyByUser(rootWorkspaces, userId);
    return treesWorkedOnLeastRecentlyByUser;
  }

  private async filterByWhetherCurrentlyBeingWorkedOn(workspaces) {
    return workspaces.filter(w => !this.schedule.isWorkspaceCurrentlyBeingWorkedOn(w));
  }

  private filterByWhetherHasMinBudget(workspaces) {
    return workspaces.filter(w => this.hasMinRemaining(w));
  }

  private async filterByWhetherNotYetWorkedOn(workspaces) {
    return await filter(
      workspaces,
      async w => !await this.schedule.hasWorkspaceBeenWorkedOnYet(w)
    );
  }

  private hasMinRemaining(workspace) {
    return (workspace.totalBudget - workspace.allocatedBudget) >= 90;
  }

  private getWorkspacesExceedingMinDistFromWorkedOnWorkspace({
    minDist,
    shouldResetCache = true,
    userId,
    workspaces,
    workspacesInTree,
  }) {
    return this.schedule.getWorkspacesExceedingMinDistFromWorkedOnWorkspace({
      minDist,
      shouldResetCache,
      userId,
      workspaces, 
      workspacesInTree,
    });
  }

  private getWorkspacesWithMostDistFromWorkedOnWorkspace({
    shouldResetCache = true,
    userId,
    workspaces,
    workspacesInTree,
  }) {
    return this.schedule.getWorkspacesWithMostDistFromWorkedOnWorkspace({
      shouldResetCache,  
      userId,
      workspaces, 
      workspacesInTree,
    });
  }

  private resetCaches() {
    this.rootParentCache.clearRootParentCache();
    this.remainingBudgetAmongDescendantsCache = new this.RemainingBudgetAmongDescendantsCache();
    this.numberOfStaleDescendantsCache = new this.NumberOfStaleDescendantsCache();
  }
}

export { Scheduler };
