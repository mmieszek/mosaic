import Sequelize from 'sequelize';
import {eventRelationshipColumns, eventHooks, addEventAssociations} from '../eventIntegration';
import * as _ from "lodash";
const Op = Sequelize.Op;

function getTopLevelInlinesAsArray(node) {
  let array: any = [];

  node.nodes.forEach((child) => {
    if (child.object === "text") { return; }
    if (child.object === "inline") {
      array.push(child);
    }
    if (_.has(child, 'nodes')) {
      array = array.concat(getTopLevelInlinesAsArray(child))
    }
  });

  return array;
}

const PointerModel = (sequelize, DataTypes) => {
  var Pointer = sequelize.define('Pointer', {
    id: {
      type: DataTypes.UUID(),
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
    },
    ...eventRelationshipColumns(DataTypes),
    value: {
      type: Sequelize.VIRTUAL(Sequelize.JSON, ['id', 'sourceBlockId']), 
      get: async function() {
        const pointerId = this.get("id");
        const sourceBlockId = this.get("sourceBlockId");
        const sourceBlock = await sequelize.models.Block.findById(sourceBlockId)
        const {cachedExportPointerValues} = sourceBlock;
        return cachedExportPointerValues[pointerId]
      }
    },
  }, {
    hooks: {
        beforeValidate: eventHooks.beforeValidate,
    },
  })

  Pointer.associate = function(models){
    Pointer.SourceBlock = Pointer.belongsTo(models.Block, {as: 'sourceBlock', foreignKey: 'sourceBlockId'})
    addEventAssociations(Pointer, models)
  }

  Pointer.prototype.containedPointers = async function() {
    const directPointers = await this.directContainedPointers()
    let allPointers:any = [...directPointers]
    for (const pointer of allPointers) {
      const directImports = await pointer.directContainedPointers();
      directImports.filter(p => !_.includes(allPointers.map(p => p.id), p.id)).forEach(p => {
        allPointers.push(p)
      })
    }
    return allPointers
  }

  Pointer.prototype.directContainedPointers = async function() {
    const pointerIds = await this.directContainedPointerIds()
    const pointers = await sequelize.models.Pointer.findAll({
      where: {
        id: {
          [Op.in]: _.uniq(pointerIds),
        }
      }
    })
    return pointers
  }

  Pointer.prototype.directContainedPointerIds = async function() {
    const value = await this.value
    if (!value) { return [] }

    const inlines =  getTopLevelInlinesAsArray(value)
    const pointerInlines =  inlines.filter((l) => !!l.data.pointerId)
    const pointerIds = pointerInlines.map(p => p.data.pointerId)
    return pointerIds
  }

  return Pointer
};

export default PointerModel;