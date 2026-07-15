/**
 * Render a sample authoring document for the generated core's counter cartridge format.
 * Deterministic; takes no arguments.
 */
export function sampleCartridgeTemplate() {
  return `/** Sample authoring document for the generated core's counter cartridge format. */
export const document = {
  target: 3
};

export default document;
`;
}
