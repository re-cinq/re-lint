it.each`
  input | output
  ${1}  | ${2}
`("doubles $input", ({ input, output }) => {
  expect(input * 2).toBe(output);
});
