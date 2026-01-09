const fs = require("fs");
const path = require("path");

const writeToFile = async (filename, data) => {
  const dir = path.dirname(filename);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(filename, data);
  console.log(`The file ${filename} has been saved!`);
};

const camelCaseToDash = (string) => {
  return string.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
};

const flattenArray = (arr, d = 1) => {
  return d > 0
    ? arr.reduce(
        (acc, val) =>
          acc.concat(Array.isArray(val) ? flattenArray(val, d - 1) : val),
        []
      )
    : arr.slice();
};

const createFolder = async (path) => {
  try {
    await fs.promises.access(path, fs.constants.F_OK);
  } catch (err) {
    await fs.promises.mkdir(path, { recursive: true });
  }
};

const filterPrivateComponents = svgs => svgs.filter(({ name }) => !name.startsWith('.') && !name.startsWith('_'))

exports.writeToFile = writeToFile;
exports.camelCaseToDash = camelCaseToDash;
exports.flattenArray = flattenArray;
exports.createFolder = createFolder;
exports.filterPrivateComponents = filterPrivateComponents;
