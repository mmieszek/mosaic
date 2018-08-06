import { SPACER } from "../../lib/slate-pointers/exportedPointerSpacer";
import { Change } from "../../components/BlockEditor/types";
import { normalizeExportSpacing } from "../../components/BlockEditor/normalizeChange";

export function normalizeAfterRemoval(c: Change) {
  const value = c.value;

  value.document.getTexts().forEach(textNode => {
    // remove all spacer characters
    const oldText = textNode.text;
    const newText = oldText.split(SPACER).join("");
    c.insertTextByKey(textNode.key, textNode.text.length, newText);
    c.removeTextByKey(textNode.key, 0, textNode.text.length);

    // add required space characters
    normalizeExportSpacing(c);
  });

  return c;
}
