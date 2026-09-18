import { defineProgram } from "../src/program.js";
export default defineProgram({
  nodes: [
    {
      id: "is_fruit",
      question: () => ({ type: "boolean", instructions: "Does `input` name a fruit?" }),
    },
    {
      id: "color",
      dependsOn: ["is_fruit"],
      when: (a) => (a.is_fruit.probability ?? 0) > 0.7,
      question: () => ({
        type: "choice",
        instructions: "Which color best describes the fruit in `input`?",
        criteria: {
          yellow: "usually yellow when ripe",
          blue: "usually blue when ripe",
          other: "none of these",
        },
      }),
    },
  ],
});
