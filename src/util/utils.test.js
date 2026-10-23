const Utils = require("./utils");

describe("Converts camelCase to kebab-case", () => {
  it("changes bookName to book-name", () => {
    expect(Utils.camelCaseToDash("bookName")).toEqual("book-name");
  });
});

describe("Flatten Array", () => {
  it("flattens an deep nested array", () => {
    const array = [1, 2, [3, 4, [5, 6, [7, 8, [9, 10]]]]];
    const result = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(Utils.flattenArray(array, Infinity)).toEqual(result);
  });

  it("flattens an array up to 2 levels deep", () => {
    const array = [1, 2, [3, 4, [5, 6, [7, 8, [9, 10]]]]];
    const result = [1, 2, 3, 4, 5, 6, [7, 8, [9, 10]]];
    expect(Utils.flattenArray(array, 2)).toEqual(result);
  });
});

describe('Filter Private Components ', () => {
  it('should remove components out of the list that start with a dot or underscore', () => {
    expect(Utils.filterPrivateComponents([
      { id: '798:3673', name: '_circle' },
      { id: '798:3672', name: '.downhill_skiing' },
      { id: '798:3671', name: 'edit_notifications' },
      { id: '798:3663', name: '.elderly' },
      { id: '798:3673', name: 'emoji_emotions' },
    ])).toEqual([
      { id: '798:3671', name: 'edit_notifications' },
      { id: '798:3673', name: 'emoji_emotions' },
    ])
  })
})

describe('Containers', () => {
  const section = name => ({ type: 'SECTION', name });
  const options = { includeSections: true, excludedSections: Utils.parseNameList(' 🔍 To review by design , Archive') };

  it('walks groups and frames whatever the options', () => {
    expect(Utils.isContainer({ type: 'GROUP', name: 'g' }, { includeSections: false, excludedSections: [] })).toBe(true);
    expect(Utils.isContainer({ type: 'FRAME', name: 'f' }, options)).toBe(true);
  });

  it('skips sections unless included', () => {
    expect(Utils.isContainer(section('Icons'), { includeSections: false, excludedSections: [] })).toBe(false);
    expect(Utils.isContainer(section('Icons'), options)).toBe(true);
  });

  it('skips the excluded sections by trimmed name', () => {
    expect(Utils.isContainer(section('🔍 To review by design'), options)).toBe(false);
    expect(Utils.isContainer(section('Archive '), options)).toBe(false);
  });

  it('never walks into components or component sets', () => {
    expect(Utils.isContainer({ type: 'COMPONENT_SET', name: 's' }, options)).toBe(false);
  });

  it('reads an unset list as empty', () => {
    expect(Utils.parseNameList(undefined)).toEqual([]);
  });
});
