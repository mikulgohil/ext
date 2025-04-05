const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

// Create a temporary directory for storing uploaded images
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
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
            content: "You are a Next.js component generator specialized in creating high-quality, reusable React components with TypeScript and Tailwind CSS. When given a description and optionally an image reference, you will generate a complete, well-structured component that follows best practices.\n\nYour output MUST follow this exact format:\n\n1. Start with a line containing ONLY the component name in PascalCase, like this: 'COMPONENT_NAME: ComponentName'\n\n2. Then include a header section with helpful instructions for using the component, like this:\n```\n/*\n * ComponentName - [Brief description]\n * \n * USAGE:\n * import { ComponentName } from '@/components/ComponentName';\n * \n * <ComponentName prop1=\"value\" prop2={value} />\n * \n * PROPS:\n * - prop1: Description of prop1\n * - prop2: Description of prop2\n */\n```\n\n3. TypeScript interface for props\n\n4. The complete component code with proper imports\n\n5. Detailed comments explaining the component structure and functionality\n\n6. Tailwind CSS classes for styling\n\nMake sure the component is responsive, accessible, and follows modern React patterns like hooks."
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
    const componentNameMatch = generatedText.match(/COMPONENT_NAME:\s*([A-Z][a-zA-Z0-9]*)/);

    // Extract component name from the response or from the prompt
    let componentName = componentNameMatch ? componentNameMatch[1] : null;

    // If component name wasn't found in the expected format, try to extract it from the prompt
    if (!componentName) {
        // Look for patterns like "Create a Card component" or "Generate a Button component"
        const promptComponentMatch = prompt.match(/(?:create|generate|make)\s+(?:a|an)\s+([A-Z][a-zA-Z0-9]*|[a-z][a-zA-Z0-9]*)\s+component/i);
        if (promptComponentMatch) {
            // Convert to PascalCase
            componentName = promptComponentMatch[1].charAt(0).toUpperCase() + promptComponentMatch[1].slice(1);
        } else {
            // Default to GeneratedComponent if no name can be extracted
            componentName = 'GeneratedComponent';
        }
    }

    // Extract the component code
    const codeMatch = generatedText.match(/```tsx\s*([\s\S]*?)```/);
    let componentCode = codeMatch ? codeMatch[1].trim() : generatedText;

    // Check if the header comment is already present, if not add it
    if (!componentCode.includes('/*') || !componentCode.includes('USAGE:')) {
        const headerComment = `/*
 * ${componentName} - Component generated from user description
 * 
 * USAGE:
 * import { ${componentName} } from '@/components/${componentName}';
 * 
 * <${componentName} prop1="value" prop2={value} />
 * 
 * PROPS:
 * Check the ${componentName}Props interface below for available props
 * 
 * CUSTOMIZATION:
 * - Modify the component props interface to add or remove properties
 * - Adjust the Tailwind CSS classes to change the styling
 * - Add additional functionality as needed
 */
`;
        componentCode = headerComment + componentCode;
    }

    return {
        componentName,
        componentCode,
        fullResponse: generatedText
    };
}

/**
 * Clean up temporary files
 */
function cleanupTempFiles() {
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
    generateComponent,
    cleanupTempFiles
};
