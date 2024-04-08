require("dotenv").config();
const axios = require("axios");
const figmaRestApi = require("./util/figmaRestApi");
const Utils = require("./util/utils");
const path = require('path');
const outputFolder = "./icons/";
const rateLimit = 20;
const waitTimeInSeconds = 30;

const getProjectNode = async () => {
  return await figmaRestApi.get(
    `files/${process.env.FIGMA_PROJECT_ID}/nodes?ids=${process.env.FIGMA_PROJECT_NODE_ID}`
  );
};

const getSVGURL = async (id) => {
  return await figmaRestApi.get(
    `images/${process.env.FIGMA_PROJECT_ID}/?ids=${id}&format=svg`
  );
};

const extractFigmaGroup = (children) => {
  const svgs = [];

  // SVG in current folder
  const components = children.filter(c => c.type === 'COMPONENT');
  if (components.length > 0) {
    svgs.push(...components);
  }

  // Sub-groups
  const groups = children.filter(c => c.type === 'GROUP' || c.type === 'FRAME');
  groups.forEach(group => {
    const groupComponents = extractFigmaGroup(group.children);
    if (groupComponents.length > 0) {
      svgs.push(...groupComponents);
    }
  });

  return svgs;
};

const svgExporter = async () => {
  try {
    const response = await getProjectNode();
    const rootFrame = await response.data.nodes[
      process.env.FIGMA_PROJECT_NODE_ID
    ].document.children;
    
    // Filter different icon size from single frame
    const iconSizes = ['24px', '16px'];
    const iconFrame = rootFrame.filter(frame => iconSizes.includes(frame.name));

    // Top level svgs
    let svgs = extractFigmaGroup(iconFrame);

    // If ignoring private components
    if (process.env.FILTER_PRIVATE_COMPONENTS !== 'false') {
      svgs = Utils.filterPrivateComponents(svgs);
    }

    const numOfSvgs = svgs.length;

    console.log("Number of SVGs", numOfSvgs);

    for (i = 0; i < numOfSvgs; i += rateLimit) {
      const requests = svgs.slice(i, i + rateLimit).map(async (svg) => {
        // Get URL of each SVG
        let svgName = svg.name.replaceAll(' ', '');
        // keep only one level of folders with the size
        const svgSubfolders = svgName.split('/');
        if (svgSubfolders.length >= 2) {
          svgName = [svgSubfolders[0], svgSubfolders.slice(1).join('-')].join('/')
        }

        // Create subdirectories for icon (e.g. svg/16px/name.svg)
        await Utils.createFolder(path.join(outputFolder, path.dirname(svgName)));

        const svgURL = await getSVGURL(svg.id);

        // Get SVG DOM
        const svgDOM = await axios.get(svgURL.data.images[svg.id]);
        Utils.writeToFile(
          path.join(outputFolder, `${Utils.camelCaseToDash(svgName)}.svg`),
          svgDOM.data
        );
      });

      await Promise.all(requests)
        .then(() => {
          console.log(`Wait for ${waitTimeInSeconds} seconds`);
          return new Promise((resolve) => {
            setTimeout(() => {
              console.log(`${waitTimeInSeconds} seconds!`);
              resolve();
            }, waitTimeInSeconds * 1000);
          });
        })
        .catch((err) => console.error(`Error proccessing ${i} - Error ${err}`));
    }
  } catch (err) {
    console.error(err);
  }
};

svgExporter();
