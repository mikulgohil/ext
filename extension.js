const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
const FormData = require('form-data');

// Create a temporary directory for storing uploaded images
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Next.js Component Generator is now active!');

    // Register the command to start the chat interface
    let disposable = vscode.commands.registerCommand('nextjs-component-generator.start', async function () {
        // Create and show the chat panel
        const panel = vscode.window.createWebviewPanel(
            'nextjsComponentGenerator',
            'Next.js Component Generator',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(context.extensionPath, 'media'))
                ],
                retainContextWhenHidden: true
            }
        );

        // Set the HTML content for the webview
        panel.webview.html = getWebviewContent(panel.webview, context);

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'generateComponent':
                        try {
                            const result = await generateComponent(message.prompt, message.imageData);
                            panel.webview.postMessage({ command: 'result', result });

                            // Create the component file if requested
                            if (message.createFile && result.componentCode) {
                                const successMessage = await createComponentFile(
                                    result.componentName,
                                    result.componentCode,
                                    message.outputFolder,
                                    message.createStorybook,
                                    message.createMockData
                                );
                                vscode.window.showInformationMessage(successMessage);
                            }
                        } catch (error) {
                            panel.webview.postMessage({
                                command: 'error',
                                error: error.message || 'An error occurred while generating the component.'
                            });
                            vscode.window.showErrorMessage(`Error: ${error.message}`);
                        }
                        break;

                    case 'browseFolder':
                        try {
                            const selectedFolder = await vscode.window.showOpenDialog({
                                canSelectFiles: false,
                                canSelectFolders: true,
                                canSelectMany: false,
                                openLabel: 'Select Output Folder'
                            });

                            if (selectedFolder && selectedFolder.length > 0) {
                                panel.webview.postMessage({
                                    command: 'folderSelected',
                                    folderPath: selectedFolder[0].fsPath
                                });
                            }
                        } catch (error) {
                            console.error('Error selecting folder:', error);
                        }
                        break;
                }
            },
            undefined,
            context.subscriptions
        );
    });

    context.subscriptions.push(disposable);
}

/**
 * Generate a Next.js component using OpenAI API
 * @param {string} prompt - User's description of the component
 * @param {string} imageData - Base64 encoded image data (optional)
 * @returns {Promise<Object>} - Generated component details
 */
async function generateComponent(prompt, imageData) {
    // Check if OpenAI API key is configured
    const config = vscode.workspace.getConfiguration('nextjsComponentGenerator');
    const apiKey = config.get('openaiApiKey');

    if (!apiKey) {
        // Prompt user to enter API key if not configured
        const enteredKey = await vscode.window.showInputBox({
            prompt: 'Please enter your OpenAI API key',
            password: true,
            ignoreFocusOut: true,
            placeHolder: 'sk-...'
        });

        if (!enteredKey) {
            throw new Error('OpenAI API key is required to generate components.');
        }

        // Save the API key in settings
        await config.update('openaiApiKey', enteredKey, vscode.ConfigurationTarget.Global);
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
        apiKey: apiKey || config.get('openaiApiKey')
    });

    // Prepare the messages for the API call
    const messages = [
        {
            role: 'system',
            content: "You are a Next.js component generator specialized in creating high-quality, reusable React components with TypeScript and Tailwind CSS. When given a description and optionally an image reference, you will generate a complete, well-structured component that follows best practices. Your output should include: 1. A component name (in PascalCase), 2. TypeScript interface for props, 3. The complete component code with proper imports, 4. Detailed comments explaining the component structure and functionality, 5. Tailwind CSS classes for styling. Make sure the component is responsive, accessible, and follows modern React patterns like hooks."
        },
        {
            role: 'user',
            content: []
        }
    ];

    // Add text prompt to the message
    messages[1].content.push({
        type: 'text',
        text: "Create a Next.js component based on this description: " + prompt
    });

    // Add image to the message if provided
    if (imageData) {
        // Extract the base64 data from the data URL
        const base64Data = imageData.split(',')[1];
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // Save the image temporarily
        const imagePath = path.join(tempDir, `reference_${Date.now()}.png`);
        fs.writeFileSync(imagePath, imageBuffer);

        // Add the image to the message
        messages[1].content.push({
            type: 'image_url',
            image_url: {
                url: "data:image/png;base64," + base64Data,
                detail: 'high'
            }
        });
    }

    // Call the OpenAI API
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',  // Updated from deprecated gpt-4-vision-preview to gpt-4o which supports vision
        messages: messages,
        max_tokens: 4096,
        temperature: 0.7
    });

    const generatedText = response.choices[0].message.content;

    // Parse the component name and code from the response
    const componentNameMatch = generatedText.match(/```tsx\s*(?:\/\/\s*)?([A-Z][a-zA-Z0-9]*)\s*\.tsx/);
    const componentName = componentNameMatch ? componentNameMatch[1] : 'GeneratedComponent';

    // Extract the component code
    const codeMatch = generatedText.match(/```tsx\s*([\s\S]*?)```/);
    const componentCode = codeMatch ? codeMatch[1].trim() : generatedText;

    return {
        componentName,
        componentCode,
        fullResponse: generatedText
    };
}

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

    // Create component directory if it doesn't exist
    const componentDir = path.join(componentsDir, componentName);
    if (!fs.existsSync(componentDir)) {
        fs.mkdirSync(componentDir, { recursive: true });
    }

    // Ensure component name is in PascalCase
    const pascalCaseName = componentName.charAt(0).toUpperCase() + componentName.slice(1);

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

/**
 * Get the HTML content for the webview
 * @param {vscode.Webview} webview - The webview
 * @param {vscode.ExtensionContext} context - The extension context
 * @returns {string} - HTML content
 */
function getWebviewContent(webview, context) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Next.js Component Generator</title>
    <style>
        body { font-family: system-ui; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; }
        h1 { font-size: 24px; margin-bottom: 20px; }
        .input-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        textarea { width: 100%; height: 100px; padding: 8px; border: 1px solid #ccc; border-radius: 4px; }
        button { background-color: #0078d4; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-right: 10px; }
        button:hover { background-color: #005a9e; }
        .checkbox-group { margin-top: 10px; display: flex; align-items: center; }
        .checkbox-group input { margin-right: 8px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Next.js Component Generator</h1>
        
        <div class="input-group">
            <label for="prompt">Describe the component you want to create:</label>
            <textarea id="prompt" placeholder="E.g., A responsive pricing card with a title, price, features list, and a call-to-action button."></textarea>
        </div>
        
        <div class="checkbox-group">
            <input type="checkbox" id="createFile" checked>
            <label for="createFile">Create component file after generation</label>
        </div>
        
        <div id="fileOptions" style="margin-top: 15px;">
            <div class="checkbox-group">
                <input type="checkbox" id="createStorybook">
                <label for="createStorybook">Generate Storybook file</label>
            </div>
            
            <div class="checkbox-group">
                <input type="checkbox" id="createMockData">
                <label for="createMockData">Generate mock data file</label>
            </div>
        </div>
        
        <div style="margin-top: 20px;">
            <button id="generateBtn">Generate Component</button>
            <button id="clearBtn">Clear</button>
        </div>
        
        <div id="result" style="margin-top: 20px; white-space: pre-wrap; display: none;"></div>
    </div>
    
    <script>
        (function() {
            const vscode = acquireVsCodeApi();
            
            // Elements
            const promptInput = document.getElementById('prompt');
            const generateBtn = document.getElementById('generateBtn');
            const clearBtn = document.getElementById('clearBtn');
            const createFileCheckbox = document.getElementById('createFile');
            const fileOptionsEl = document.getElementById('fileOptions');
            const createStorybookCheckbox = document.getElementById('createStorybook');
            const createMockDataCheckbox = document.getElementById('createMockData');
            const resultEl = document.getElementById('result');
            
            // Toggle file options visibility
            createFileCheckbox.addEventListener('change', () => {
                fileOptionsEl.style.display = createFileCheckbox.checked ? 'block' : 'none';
            });
            
            // Generate component
            generateBtn.addEventListener('click', () => {
                const prompt = promptInput.value.trim();
                if (!prompt) {
                    alert('Please provide a description for the component.');
                    return;
                }
                
                // Send message to extension
                vscode.postMessage({
                    command: 'generateComponent',
                    prompt: prompt,
                    createFile: createFileCheckbox.checked,
                    createStorybook: createStorybookCheckbox.checked,
                    createMockData: createMockDataCheckbox.checked
                });
                
                generateBtn.disabled = true;
                generateBtn.textContent = 'Generating...';
            });
            
            // Clear form
            clearBtn.addEventListener('click', () => {
                promptInput.value = '';
                resultEl.style.display = 'none';
            });
            
            // Handle messages from the extension
            window.addEventListener('message', (event) => {
                const message = event.data;
                
                switch (message.command) {
                    case 'result':
                        generateBtn.disabled = false;
                        generateBtn.textContent = 'Generate Component';
                        
                        // Show result
                        resultEl.textContent = message.result.fullResponse;
                        resultEl.style.display = 'block';
                        break;
                        
                    case 'error':
                        generateBtn.disabled = false;
                        generateBtn.textContent = 'Generate Component';
                        alert('Error: ' + message.error);
                        break;
                }
            });
        }());
    </script>
</body>
</html>`;
}

function deactivate() {
    // Clean up temporary files
    if (fs.existsSync(tempDir)) {
        try {
            fs.readdirSync(tempDir).forEach(file => {
                const filePath = path.join(tempDir, file);
                fs.unlinkSync(filePath);
            });
        } catch (error) {
            console.error('Error cleaning up temporary files:', error);
        }
    }
}

module.exports = {
    activate,
    deactivate
};
