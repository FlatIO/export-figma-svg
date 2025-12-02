require('dotenv').config();
const path = require('node:path');
const axios = require('axios');
const figmaRestApi = require('./util/figmaRestApi');
const Utils = require('./util/utils');
const outputFolder = process.env.FIGMA_ICONS_OUTPUT_FOLDER || './icons/';
const rateLimit = 2;

const ICON_SIZES = ['24px', '16px'];

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

  const componentsSets = children.filter(c => c.type === 'COMPONENT_SET');
  componentsSets.forEach(componentsSet => {
    const groupComponents = extractFigmaGroup(componentsSet.children);
    if (groupComponents.length > 0) {
      groupComponents.forEach(component => {
        component.name = `name=${componentsSet.name}, ${component.name}`;
        svgs.push(component);
      });
    }
  });

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

const buildFilename = (svgName) => {
  svgName = svgName.trim().replaceAll(' ', '');

  // Component set with attributes, e.g. name=list,size=24px,style=outline
  if (svgName.includes('=')) {

    // { name: 'caract-left', state: 'default', size: '24px' }
    const attributes = svgName.split(',').map(attr => {
      const [key, value] = attr.split('=');
      return { key, value };
    }).reduce((obj, item) => {
      obj[item.key] = item.value;
      return obj;
    }, {});

    if (!attributes.size) {
      console.error(`Size attribute not found for ${svgName}`);
      return null;
    }

    svgName = `${attributes.size}/${attributes.name}`;
    if (attributes.state && attributes.state !== 'default') {
      svgName += `-${attributes.state}`;
    }
    if (attributes.style) {
      svgName += `-${attributes.style}`;
    }

    return svgName;
  }

  // Old icons, e.g. ' 24px / icon name' to '24px-icon-name'
  // - keep only one level of folders with the size
  const svgSubfolders = svgName.split('/');
  if (svgSubfolders.length >= 2) {
    svgName = [svgSubfolders[0], svgSubfolders.slice(1).join('-')].join('/')
  }
  return svgName;
}

const svgExporter = async () => {
  try {
    const response = await getProjectNode();
    const rootFrame = await response.data.nodes[
      process.env.FIGMA_PROJECT_NODE_ID
    ].document.children;

    // Filter different icon size from single frame
    const iconFrame = rootFrame.filter(frame => ICON_SIZES.includes(frame.name) || frame.type === 'COMPONENT_SET');
    
    // Top level svgs
    let svgs = extractFigmaGroup(iconFrame);

    // If ignoring private components
    if (process.env.FILTER_PRIVATE_COMPONENTS !== 'false') {
      svgs = Utils.filterPrivateComponents(svgs);
    }

    const numOfSvgs = svgs.length;

    console.log('Number of SVGs', numOfSvgs);

    for (i = 0; i < numOfSvgs; i += rateLimit) {
      const requests = svgs.slice(i, i + rateLimit).map(async (svg) => {
        // Normalize SVG name
        const svgName = buildFilename(svg.name);

        if (!svgName) {
          console.error(`Error processing ${svg.name}`);
          return;
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

      await Promise.all(requests);
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

svgExporter();
