require('dotenv').config();
const path = require('node:path');
const figmaRestApi = require('./util/figmaRestApi');
const { downloadClient } = require('./util/figmaRestApi');
const Utils = require('./util/utils');
const outputFolder = process.env.FIGMA_ICONS_OUTPUT_FOLDER || './icons/';
// Icons rendered per images request (the endpoint takes a list of ids)
const imagesBatchSize = 50;
// Parallel SVG downloads (S3, not rate limited by Figma)
const downloadConcurrency = 4;

const getProjectNode = async () => {
  return await figmaRestApi.get(
    `files/${process.env.FIGMA_PROJECT_ID}/nodes?ids=${process.env.FIGMA_PROJECT_NODE_ID}`
  );
};

const getSVGURLs = async (ids) => {
  const response = await figmaRestApi.get(
    `images/${process.env.FIGMA_PROJECT_ID}/?ids=${ids.join(',')}&format=svg`
  );
  return response.data.images;
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
      return { key: key.toLowerCase(), value };
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

    // Handle additional variant properties (e.g. Voice=Voice1)
    const knownKeys = ['name', 'size', 'state', 'style'];
    const extraKeys = Object.keys(attributes)
      .filter(key => !knownKeys.includes(key))
      .sort();

    for (const key of extraKeys) {
      svgName += `-${attributes[key]}`;
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

    // Include all frames/groups for recursive extraction of COMPONENT_SETs
    const iconFrame = rootFrame.filter(frame =>
      frame.type === 'COMPONENT_SET' || frame.type === 'FRAME' || frame.type === 'GROUP'
    );
    
    // Top level svgs
    let svgs = extractFigmaGroup(iconFrame);

    // If ignoring private components
    if (process.env.FILTER_PRIVATE_COMPONENTS !== 'false') {
      svgs = Utils.filterPrivateComponents(svgs);
    }

    const numOfSvgs = svgs.length;

    console.log('Number of SVGs', numOfSvgs);

    const files = svgs.map(svg => {
      // Normalize SVG name
      const svgName = buildFilename(svg.name);
      if (!svgName) {
        console.error(`Error processing ${svg.name}`);
      }
      return { svg, svgName };
    }).filter(({ svgName }) => svgName);

    for (let i = 0; i < files.length; i += imagesBatchSize) {
      const batch = files.slice(i, i + imagesBatchSize);
      const urls = await getSVGURLs(batch.map(({ svg }) => svg.id));

      for (let j = 0; j < batch.length; j += downloadConcurrency) {
        await Promise.all(batch.slice(j, j + downloadConcurrency).map(async ({ svg, svgName }) => {
          const url = urls[svg.id];
          if (!url) {
            throw new Error(`Figma rendered no SVG for ${svg.name} (${svg.id})`);
          }

          // Get SVG DOM
          const svgDOM = await downloadClient.get(url);
          await Utils.writeToFile(
            path.join(outputFolder, `${Utils.camelCaseToDash(svgName)}.svg`),
            svgDOM.data
          );
        }));
      }
    }
  } catch (err) {
    console.error(err.isAxiosError ? `${err.message} (${err.code ?? err.response?.status}: ${err.config?.url})` : err);
    process.exit(1);
  }
};

svgExporter();
