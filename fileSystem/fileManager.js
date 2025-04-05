const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

/**
 * Create a component file in the workspace
 * @param {string} componentName - Name of the component
 * @param {string} componentCode - Generated component code
 * @param {string} outputFolder - Custom output folder path (optional)
 * @param {boolean} createStorybook - Whether to create a Storybook file
 * @param {boolean} createMockData - Whether to create a mock data file
 */
async function createComponentFile(componentName, componentCode, outputFolder, createStorybook, createMockData) {
    // Get the active workspace folder
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        throw new Error('No workspace folder is open.');
    }

    // Determine the components directory
    let componentsDir;
    const rootPath = workspaceFolders[0].uri.fsPath;

    // Use custom output folder if provided
    if (outputFolder) {
        componentsDir = outputFolder;
        if (!fs.existsSync(componentsDir)) {
            fs.mkdirSync(componentsDir, { recursive: true });
        }
    } else {
        // Check for common Next.js component directories
        const possibleDirs = [
            path.join(rootPath, 'components'),
            path.join(rootPath, 'src', 'components'),
            path.join(rootPath, 'app', 'components')
        ];

        for (const dir of possibleDirs) {
            if (fs.existsSync(dir)) {
                componentsDir = dir;
                break;
            }
        }

        // If no components directory exists, ask the user where to save
        if (!componentsDir) {
            const selectedFolder = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Select Components Directory'
            });

            if (!selectedFolder || selectedFolder.length === 0) {
                // Default to creating a components directory in the workspace root
                componentsDir = path.join(rootPath, 'components');
                if (!fs.existsSync(componentsDir)) {
                    fs.mkdirSync(componentsDir, { recursive: true });
                }
            } else {
                componentsDir = selectedFolder[0].fsPath;
            }
        }
    }

    // Ensure component name is in PascalCase
    const pascalCaseName = componentName.charAt(0).toUpperCase() + componentName.slice(1);

    // Create component directory with the exact same name as the component
    const componentDir = path.join(componentsDir, pascalCaseName);
    if (!fs.existsSync(componentDir)) {
        fs.mkdirSync(componentDir, { recursive: true });
    }

    // Write the main component file (ComponentName.tsx instead of index.tsx)
    const componentFilePath = path.join(componentDir, `${pascalCaseName}.tsx`);
    fs.writeFileSync(componentFilePath, componentCode);

    // Create index.ts barrel file for clean exports
    const indexFilePath = path.join(componentDir, 'index.ts');
    fs.writeFileSync(indexFilePath, `export * from './${pascalCaseName}';\nexport { default } from './${pascalCaseName}';\n`);

    // Create mock data file if requested
    if (createMockData) {
        const mockDataCode = generateMockDataFile(pascalCaseName, componentCode);
        const mockDataPath = path.join(componentDir, `${pascalCaseName}.mock.ts`);
        fs.writeFileSync(mockDataPath, mockDataCode);
    }

    // Create Storybook file if requested
    if (createStorybook) {
        // If mock data is also requested, use the version with mock data imports
        if (createMockData) {
            const storybookCode = generateStorybookFile(pascalCaseName, componentCode);
            const storybookPath = path.join(componentDir, `${pascalCaseName}.stories.tsx`);
            fs.writeFileSync(storybookPath, storybookCode);
        } else {
            // Otherwise use a simpler version without mock data imports
            const storybookCode = generateSimpleStorybookFile(pascalCaseName, componentCode);
            const storybookPath = path.join(componentDir, `${pascalCaseName}.stories.tsx`);
            fs.writeFileSync(storybookPath, storybookCode);
        }
    }

    // Open the component file in the editor
    const document = await vscode.workspace.openTextDocument(componentFilePath);
    await vscode.window.showTextDocument(document);

    // Return success message
    return `Component "${pascalCaseName}" generated successfully`;
}

/**
 * Generate a Storybook file for the component
 * @param {string} componentName - Name of the component
 * @param {string} componentCode - Generated component code
 * @returns {string} - Storybook file content
 */
function generateStorybookFile(componentName, componentCode) {
    // Extract props interface from component code
    const propsInterfaceMatch = componentCode.match(/interface\s+(\w+Props)\s*{([^}]*)}/);
    const propsInterface = propsInterfaceMatch ? propsInterfaceMatch[1] : `${componentName}Props`;

    // Create a basic Storybook file
    return [
        "import React from 'react';",
        "import { Meta, StoryObj } from '@storybook/react';",
        `import ${componentName} from './index';`,
        `import { mock${componentName}Data, alternative${componentName}Data } from './${componentName}.mock';`,
        "",
        `const meta: Meta<typeof ${componentName}> = {`,
        `  title: 'Components/${componentName}',`,
        `  component: ${componentName},`,
        "  parameters: {",
        "    layout: 'centered',",
        "  },",
        "  tags: ['autodocs'],",
        "};",
        "",
        "export default meta;",
        `type Story = StoryObj<typeof ${componentName}>;`,
        "",
        "export const Default: Story = {",
        "  args: {",
        `    ...mock${componentName}Data`,
        "  },",
        "};",
        "",
        "export const Variant: Story = {",
        "  args: {",
        `    ...alternative${componentName}Data`,
        "  },",
        "};"
    ].join('\n');
}

/**
 * Generate a mock data file for the component
 * @param {string} componentName - Name of the component
 * @param {string} componentCode - Generated component code
 * @returns {string} - Mock data file content
 */
function generateMockDataFile(componentName, componentCode) {
    // Extract props interface from component code
    const propsInterfaceMatch = componentCode.match(/interface\s+(\w+Props)\s*{([^}]*)}/);
    const propsInterface = propsInterfaceMatch ? propsInterfaceMatch[1] : `${componentName}Props`;
    const propsContent = propsInterfaceMatch ? propsInterfaceMatch[2] : '';

    // Parse props to create mock data
    const mockData = {};

    // Extract all required props from the interface
    const propLines = propsContent.split('\n');
    const requiredProps = new Set();

    // First pass: identify all required props
    propLines.forEach(line => {
        // Match property name that doesn't have a ? after it (required prop)
        const requiredPropMatch = line.match(/^\s*(\w+)(\s*:|\s*;)/);
        // Also match property name with : required after it
        const explicitRequiredMatch = line.match(/^\s*(\w+)(\?)?(\s*:\s*[^;]+\s+required)/);

        if (requiredPropMatch && !line.includes('?:') && !line.includes('? :')) {
            requiredProps.add(requiredPropMatch[1]);
        }

        if (explicitRequiredMatch) {
            requiredProps.add(explicitRequiredMatch[1]);
        }
    });

    // Second pass: create mock data for all props, ensuring required ones are included
    propLines.forEach(line => {
        // Match any property name and its type
        const propMatch = line.match(/^\s*(\w+)(\?)?(\s*:\s*([^;]+))?/);

        if (propMatch) {
            const propName = propMatch[1];
            const propType = propMatch[4] ? propMatch[4].trim() : '';

            // Skip comments and empty lines
            if (propName.startsWith('//') || !propName) return;

            // Generate appropriate mock data based on prop name and type
            if (propType.includes('string') || propType === '') {
                if (propName.includes('image') || propName.includes('img') || propName.includes('src') || propName.includes('avatar') || propName.includes('photo')) {
                    mockData[propName] = 'https://via.placeholder.com/400x300';
                } else if (propName.includes('title')) {
                    mockData[propName] = `${componentName} Title`;
                } else if (propName.includes('description') || propName.includes('content') || propName.includes('text')) {
                    mockData[propName] = 'This is a sample description for the component. It provides context about what this component does.';
                } else if (propName.includes('name')) {
                    mockData[propName] = 'Sample Name';
                } else if (propName.includes('email')) {
                    mockData[propName] = 'user@example.com';
                } else if (propName.includes('url') || propName.includes('link')) {
                    mockData[propName] = 'https://example.com';
                } else if (propName.includes('button') || propName.includes('cta') || propName.includes('action')) {
                    mockData[propName] = 'Click Me';
                } else {
                    mockData[propName] = `Sample ${propName}`;
                }
            } else if (propType.includes('number')) {
                if (propName.includes('id')) {
                    mockData[propName] = 1;
                } else if (propName.includes('count') || propName.includes('quantity')) {
                    mockData[propName] = 5;
                } else if (propName.includes('price') || propName.includes('cost')) {
                    mockData[propName] = 99.99;
                } else {
                    mockData[propName] = 42;
                }
            } else if (propType.includes('boolean')) {
                mockData[propName] = true;
            } else if (propType.includes('array') || propType.includes('[]')) {
                if (propName.includes('items') || propName.includes('list') || propName.includes('data')) {
                    mockData[propName] = [
                        { id: 1, name: 'Item 1', description: 'Description for item 1' },
                        { id: 2, name: 'Item 2', description: 'Description for item 2' },
                        { id: 3, name: 'Item 3', description: 'Description for item 3' },
                    ];
                } else {
                    mockData[propName] = ['Item 1', 'Item 2', 'Item 3'];
                }
            } else if (propType.includes('function') || propType.includes('=>') || propType.includes('void')) {
                // For function props, add a comment in the mock data
                mockData[propName] = '() => console.log("Mock function called")';
            } else if (propType.includes('|')) {
                // For union types, use the first option if it's a string literal
                const options = propType.split('|').map(opt => opt.trim());
                const stringLiteral = options.find(opt => opt.startsWith("'") || opt.startsWith('"'));

                if (stringLiteral) {
                    // Remove quotes from the string literal
                    mockData[propName] = stringLiteral.replace(/['"]/g, '');
                } else if (options.includes('string')) {
                    mockData[propName] = `Sample ${propName}`;
                } else if (options.includes('number')) {
                    mockData[propName] = 42;
                } else if (options.includes('boolean')) {
                    mockData[propName] = true;
                } else {
                    mockData[propName] = options[0]; // Use the first option as a fallback
                }
            }
        }
    });

    // Handle special cases for common component props
    if (componentName.toLowerCase().includes('button') && !mockData.onClick) {
        mockData.onClick = '() => console.log("Button clicked")';
    }

    if (componentName.toLowerCase().includes('card') && !mockData.theme && propsContent.includes('theme')) {
        mockData.theme = 'light';
    }

    // Create the mock data file content
    const lines = [
        `import { ${propsInterface} } from './index';`,
        "",
        `/**`,
        ` * Mock data for ${componentName} component`,
        ` */`,
        `export const mock${componentName}Data: ${propsInterface} = ${JSON.stringify(mockData, null, 2)};`,
        "",
        `/**`,
        ` * Alternative mock data for ${componentName} component`,
        ` */`,
        `export const alternative${componentName}Data: ${propsInterface} = {`,
        `  ...mock${componentName}Data,`,
        `  // Add or override properties for the alternative version`,
        `};`
    ];

    return lines.join('\n');
}

/**
 * Generate a simple Storybook file for the component without mock data imports
 * @param {string} componentName - Name of the component
 * @param {string} componentCode - Generated component code
 * @returns {string} - Storybook file content
 */
function generateSimpleStorybookFile(componentName, componentCode) {
    // Extract props interface from component code
    const propsInterfaceMatch = componentCode.match(/interface\s+(\w+Props)\s*{([^}]*)}/);
    const propsInterface = propsInterfaceMatch ? propsInterfaceMatch[1] : `${componentName}Props`;
    const propsContent = propsInterfaceMatch ? propsInterfaceMatch[2] : '';

    // Parse props to create sample data
    const sampleProps = {};

    // Add placeholder images for image props
    if (propsContent.includes('image') || propsContent.includes('img') || propsContent.includes('src')) {
        sampleProps.image = 'https://via.placeholder.com/400x300';
    }

    // Add placeholder text for common props
    if (propsContent.includes('title')) {
        sampleProps.title = `${componentName} Title`;
    }

    if (propsContent.includes('description')) {
        sampleProps.description = 'This is a sample description for the component.';
    }

    // Create a basic Storybook file
    return [
        "import React from 'react';",
        "import { Meta, StoryObj } from '@storybook/react';",
        `import ${componentName} from './index';`,
        "",
        `const meta: Meta<typeof ${componentName}> = {`,
        `  title: 'Components/${componentName}',`,
        `  component: ${componentName},`,
        "  parameters: {",
        "    layout: 'centered',",
        "  },",
        "  tags: ['autodocs'],",
        "};",
        "",
        "export default meta;",
        `type Story = StoryObj<typeof ${componentName}>;`,
        "",
        "export const Default: Story = {",
        "  args: {",
        `    ${Object.entries(sampleProps).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(',\n    ')}`,
        "  },",
        "};",
        "",
        "export const Variant: Story = {",
        "  args: {",
        "    // Add variant props here",
        "  },",
        "};"
    ].join('\n');
}

module.exports = {
    createComponentFile
};
