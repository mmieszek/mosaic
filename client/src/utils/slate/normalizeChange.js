import { closestPointerExportAncestor } from "./closestPointerExportAncestor";
import { hasSpacerAsFirstChar } from "./hasSpacerAsFirstChar";
import { hasSpacerAsLastChar } from "./hasSpacerAsLastChar";
import { isDirectlyAfterExport } from "./isDirectlyAfterExport";
import { isDirectlyBeforeExport } from "./isDirectlyBeforeExport";
import { isFirstTextOfExport } from "./isFirstTextOfExport";
import { isLastTextOfExport } from "./isLastTextOfExport";

import { POINTER_EDGE_SPACE } from "../../lib/slate-pointers/exportedPointerSpacer";
import { Change, TextNode } from "../../components/BlockEditor/types";

export function normalizeExportSpacing(c: Change) {
  const value = c.value;

  value.document.getTexts().forEach(textNode => {
    if (isDirectlyBeforeExport(textNode, c.value.document) && !hasSpacerAsLastChar(textNode, c.value.document)) {
      c.insertTextByKey(textNode.key, textNode.text.length, POINTER_EDGE_SPACE);
    }

    textNode = c.value.document.getNode(textNode.key);
    if (isDirectlyAfterExport(textNode, c.value.document) && !hasSpacerAsFirstChar(textNode, c.value.document)) {
      c.insertTextByKey(textNode.key, 0, POINTER_EDGE_SPACE);
    }

    textNode = c.value.document.getNode(textNode.key);
    if (isFirstTextOfExport(textNode, c.value.document) && !hasSpacerAsFirstChar(textNode, c.value.document)) {
      c.insertTextByKey(textNode.key, 0, POINTER_EDGE_SPACE);
    }

    textNode = c.value.document.getNode(textNode.key);
    if (isLastTextOfExport(textNode, c.value.document) && !hasSpacerAsLastChar(textNode, c.value.document)) {
      c.insertTextByKey(textNode.key, textNode.text.length, POINTER_EDGE_SPACE);
    }

    // For edge case a pointer contains two spacers, and nothing
    // else, and you delete one. Then the first and last chars are both spacers
    // since they are the same char, so you need to additionaly enforce
    // that there are at least two chars.
    textNode = c.value.document.getNode(textNode.key);
    if ((isFirstTextOfExport(textNode, c.value.document) || isLastTextOfExport(textNode, c.value.document)) && textNode.text.length === 1) {
      c.insertTextByKey(textNode.key, 0, POINTER_EDGE_SPACE);
    }

    // for edge case where there is only one spacer between two pointers,
    // you always need two so text cursor issues don't arise
    textNode = c.value.document.getNode(textNode.key);
    if ((isDirectlyAfterExport(textNode, c.value.document) && isDirectlyAfterExport(textNode, c.value.document)) && textNode.text.length === 1) {
      c.insertTextByKey(textNode.key, 0, POINTER_EDGE_SPACE);
    }
  });

  return c;
}
