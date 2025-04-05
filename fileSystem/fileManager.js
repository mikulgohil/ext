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

    // Create Storybook file if requested
    if (createStorybook) {
        const storybookCode = generateStorybookFile(pascalCaseName, componentCode);
        const storybookPath = path.join(componentDir, `${pascalCaseName}.stories.tsx`);
        fs.writeFileSync(storybookPath, storybookCode);
    }

    // Create mock data file if requested (using .mocks.ts instead of .mock.ts)
    if (createMockData) {
        const mockDataCode = generateMockDataFile(pascalCaseName, componentCode);
        const mockDataPath = path.join(componentDir, `${pascalCaseName}.mocks.ts`);
        fs.writeFileSync(mockDataPath, mockDataCode);
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
        "    // Add default props here",
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

    // Add placeholder images for image props
    if (propsContent.includes('image') || propsContent.includes('img') || propsContent.includes('src')) {
        mockData.image = 'https://via.placeholder.com/400x300';
    }

    // Add placeholder text for common props
    if (propsContent.includes('title')) {
        mockData.title = `${componentName} Title`;
    }

    if (propsContent.includes('description')) {
        mockData.description = 'This is a sample description for the component. It provides context about what this component does.';
    }

    if (propsContent.includes('items') || propsContent.includes('list')) {
        mockData.items = [
            { id: 1, name: 'Item 1', description: 'Description for item 1' },
            { id: 2, name: 'Item 2', description: 'Description for item 2' },
            { id: 3, name: 'Item 3', description: 'Description for item 3' },
        ];
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

module.exports = {
    createComponentFile
};
