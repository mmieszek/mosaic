import { type, Node, Value } from "slate";
import { ADD_BLOCKS, UPDATE_BLOCK } from "./actions";
import Plain from "slate-plain-serializer";
import _ = require("lodash");

import { Block, Mark } from "slate";

export const blockReducer = (state = {blocks: []}, action) => {
    switch (action.type) {
      case ADD_BLOCKS:
        return {
            blocks: [...state.blocks, ...action.blocks.map((block) => {
                const value = block.value ? Value.fromJSON(block.value) : Plain.deserialize("");
                return ({
                    ...block,
                    value,
                });
            })],
        };
      case UPDATE_BLOCK:
      return {
            ...state, 
            blocks: state.blocks.map((block: any) => {
                if (block.id !== action.id) {
                    return block;
                } else {
                    return ({
                        ...block,
                        value: action.value,
                    });
                }
            }),
            };
      default:
        return state;
    }
};
  