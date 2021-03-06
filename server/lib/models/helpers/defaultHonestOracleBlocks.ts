const uuidv4 = require("uuid/v4");

export const createHonestOracleDefaultBlockValues = questionValue => {
  const a1id = uuidv4();

  const scratchpadBlockValue = [
    {
      object: "block",
      type: "line",
      isVoid: false,
      data: {},
      nodes: [
        {
          object: "text",
          leaves: [
            {
              object: "leaf",
              text:
`A (correct):  `,
              marks: [],
            },
          ],
        },
        {
          object: "inline",
          type: "pointerExport",
          isVoid: false,
          data: {
            pointerId: a1id,
          },
          nodes: [
            {
              object: "text",
              leaves: [
                {
                  object: "leaf",
                  text: "  ",
                  marks: [],
                },
              ],
            },
          ],
        },
        {
          object: "text",
          leaves: [
            {
              object: "leaf",
              text: " ",
              marks: [],
            },
          ],
        },
      ],
    },
  ];

  const answerDraftBlockValue = [
    {
      object: "block",
      type: "line",
      isVoid: false,
      data: {},
      nodes: [
        {
          object: "text",
          leaves: [
            {
              object: "leaf",
              text: "The honest oracle has responded to question ",
              marks: [],
            },
          ],
        },
        {
          object: "inline",
          type: "pointerExport",
          isVoid: false,
          data: { pointerId: uuidv4() },
          nodes: questionValue[0].nodes.map(node => processNode(node)),
        },
        {
          object: "text",
          leaves: [{ object: "leaf", text: " with answer ", marks: [] }],
        },
        {
          object: "inline",
          type: "pointerImport",
          isVoid: true,
          data: {
            pointerId: a1id,
            internalReferenceId: uuidv4(),
          },
          nodes: [
            {
              object: "text",
              leaves: [{ object: "leaf", text: " ", marks: [] }],
            },
          ],
        },
        { object: "text", leaves: [{ object: "leaf", text: ".", marks: [] }] },
      ],
    },
  ];

  const responseBlockValue = [
    {
      object: "block",
      type: "line",
      isVoid: false,
      data: {},
      nodes: [
        {
          object: "text",
          leaves: [
            { object: "leaf", text: `A `, marks: [] },
          ],
        },
        {
          object: "inline",
          type: "pointerImport",
          isVoid: true,
          data: {
            pointerId: a1id,
            internalReferenceId: uuidv4(),
          },
          nodes: [
            {
              object: "text",
              leaves: [{ object: "leaf", text: " ", marks: [] }],
            },
          ],
        },
        { object: "text", leaves: [{ object: "leaf", text: "", marks: [] }] },
      ],
    },
  ];

  return {
    scratchpadBlockValue,
    answerDraftBlockValue,
    responseBlockValue,
  };
};

function processNode(node: any) {
  if (node.type === "pointerImport") {
    return {
      ...node,
      data: {
        ...node.data,
        internalReferenceId: uuidv4(), // generate new id so you can open/close this independently of the one it copied
      }
    };
  } else if (node.type === "pointerExport") {
    return {
      object: "inline",
      type: "pointerImport",
      isVoid: true,
      data: {
        pointerId: node.data.pointerId,
        internalReferenceId: uuidv4(),
      }
    };
  } else if (node.nodes) {
    return {
      ...node,
      nodes: node.nodes.map(node => processNode(node)),
    };
  } else {
    return node;
  }
}