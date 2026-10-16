/**
 * T-483: the intake chain counts blanks without loading the export code
 * (docx, file-saver). exportUtils still exposes the same functions.
 */
describe('T-483 intake blank count does not load the export libraries', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('loads briefTypes and blankCount with docx and file-saver unavailable, and counts', () => {
    jest.doMock('docx', () => {
      throw new Error('docx loaded');
    });
    jest.doMock('file-saver', () => {
      throw new Error('file-saver loaded');
    });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const types = require('../briefTypes');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const counter = require('@/components/editor/blankCount');
    expect(types.countBlanks('A [To be confirmed: x] and {{MISSING: y}}.')).toBe(2);
    expect(counter.blanksInContent('A [To be confirmed: x]')).toHaveLength(1);
  });

  it('exportUtils re-exports the same functions', () => {
    jest.dontMock('docx');
    jest.dontMock('file-saver');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const counter = require('@/components/editor/blankCount');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const exp = require('@/components/editor/exportUtils');
    expect(exp.blanksInContent).toBe(counter.blanksInContent);
    expect(exp.missingAsBlanks).toBe(counter.missingAsBlanks);
  });
});
