const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { Anthropic } = require('@anthropic-ai/sdk');

// Create a temporary directory for storing uploaded images
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

/**
 * Generate a Next.js component using Anthropic API
 * @param {string} prompt - User's description of the component
 * @param {string} imageData - Base64 encoded image data (optional)
 * @returns {Promise<Object>} - Generated component details
 */
async function generateComponent(prompt, imageData) {
    // Check if Anthropic API key is configured
    const config = vscode.workspace.getConfiguration('nextjsComponentGenerator');
    const apiKey = config.get('anthropicApiKey');

    if (!apiKey) {
        // Prompt user to enter API key if not configured
        const enteredKey = await vscode.window.showInputBox({
            prompt: 'Please enter your Anthropic API key',
            password: true,
            ignoreFocusOut: true,
            placeHolder: 'sk-ant-...'
        });

        if (!enteredKey) {
            throw new Error('Anthropic API key is required to generate components.');
        }

        // Save the API key in settings
        await config.update('anthropicApiKey', enteredKey, vscode.ConfigurationTarget.Global);
    }

    // Initialize Anthropic client
    const anthropic = new Anthropic({
        apiKey: apiKey || config.get('anthropicApiKey')
    });

    // Prepare the messages for the API call
    let systemPrompt = "You are a Next.js component generator specialized in creating high-quality, reusable React components with TypeScript and Tailwind CSS. When given a description and optionally an image reference, you will generate a complete, well-structured component that follows best practices.\n\nYour output MUST follow this exact format:\n\n1. Start with a line containing ONLY the component name in PascalCase, like this: 'COMPONENT_NAME: ComponentName'\n\n2. Then include a header section with helpful instructions for using the component, like this:\n```\n/*\n * ComponentName - [Brief description]\n * \n * USAGE:\n * import { ComponentName } from '@/components/ComponentName';\n * \n * <ComponentName prop1=\"value\" prop2={value} />\n * \n * PROPS:\n * - prop1: Description of prop1\n * - prop2: Description of prop2\n */\n```\n\n3. TypeScript interface for props\n\n4. The complete component code with proper imports\n\n5. Detailed comments explaining the component structure and functionality\n\n6. Tailwind CSS classes for styling\n\nIMPORTANT: You MUST include the actual component implementation, not just the interface. Always include the full React component with a return statement that renders JSX. Never provide just the interface definition without the component implementation.\n\nMake sure the component is responsive, accessible, and follows modern React patterns like hooks.";

    let userPrompt = "Create a Next.js component based on this description: " + prompt;

    // Prepare the messages array
    const messages = [
        {
            role: 'user',
            content: userPrompt
        }
    ];

    // If image data is provided, we need to use the Anthropic Messages API with media
    if (imageData) {
        // Extract the base64 data from the data URL
        const base64Data = imageData.split(',')[1];
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // Save the image temporarily
        const imagePath = path.join(tempDir, `reference_${Date.now()}.png`);
        fs.writeFileSync(imagePath, imageBuffer);

        // Call the Anthropic API with image
        const response = await anthropic.messages.create({
            model: 'claude-3-opus-20240229',
            system: systemPrompt,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: userPrompt
                        },
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: 'image/png',
                                data: base64Data
                            }
                        }
                    ]
                }
            ],
            max_tokens: 4096,
            temperature: 0.7
        });

        var generatedText = response.content[0].text;
    } else {
        // Call the Anthropic API without image
        const response = await anthropic.messages.create({
            model: 'claude-3-opus-20240229',
            system: systemPrompt,
            messages: [
                {
                    role: 'user',
                    content: userPrompt
                }
            ],
            max_tokens: 4096,
            temperature: 0.7
        });

        var generatedText = response.content[0].text;
    }

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

    // Clean up the generated text by removing the COMPONENT_NAME line
    let cleanedText = generatedText.replace(/COMPONENT_NAME:\s*([A-Z][a-zA-Z0-9]*)\s*\n/, '');

    // Extract the component code from code blocks
    const codeMatch = cleanedText.match(/```tsx\s*([\s\S]*?)```/) || cleanedText.match(/```typescript\s*([\s\S]*?)```/) || cleanedText.match(/```jsx\s*([\s\S]*?)```/) || cleanedText.match(/```js\s*([\s\S]*?)```/);

    // If code blocks are found, extract the content, otherwise use the cleaned text
    let componentCode = codeMatch ? codeMatch[1].trim() : cleanedText;

    // Remove any remaining markdown code blocks
    componentCode = componentCode.replace(/```[a-z]*\s*/g, '').replace(/```\s*$/g, '');

    // Extract any detailed comments that might be outside the code block
    const detailedCommentsMatch = cleanedText.match(/```.*?```\s*([\s\S]*)/);
    let detailedComments = '';
    if (detailedCommentsMatch && detailedCommentsMatch[1]) {
        detailedComments = detailedCommentsMatch[1].trim();
    }

    // Add default export if only named export exists
    if (componentCode.includes('export const ' + componentName) && !componentCode.includes('export default')) {
        componentCode += `\n\nexport default ${componentName};\n`;
    }

    // Ensure the component has a complete implementation
    // Check if the component code is missing the actual component implementation
    if (!componentCode.includes('function ' + componentName) &&
        !componentCode.includes('const ' + componentName) &&
        !componentCode.includes('class ' + componentName) &&
        !componentCode.includes('export function ' + componentName) &&
        !componentCode.includes('export const ' + componentName) &&
        !componentCode.includes('export default function ' + componentName)) {

        // If only the interface is present, add a basic component implementation
        if (componentCode.includes('interface ' + componentName + 'Props')) {
            // Extract props from interface
            const interfaceMatch = componentCode.match(new RegExp(`interface\\s+${componentName}Props\\s*{([\\s\\S]*?)}`));
            let propsStr = '';

            if (interfaceMatch) {
                const interfaceContent = interfaceMatch[1];
                const propLines = interfaceContent.split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('//') && !line.startsWith('/*'));

                propsStr = propLines
                    .map(line => {
                        const propMatch = line.match(/(\w+)[\?]?:/);
                        return propMatch ? propMatch[1] : null;
                    })
                    .filter(Boolean)
                    .join(',\n  ');
            }

            componentCode += `\nimport React from 'react';\n\nexport const ${componentName}: React.FC<${componentName}Props> = ({
  ${propsStr}
}) => {
  return (
    <div className="rounded-lg shadow-md p-6 bg-white">
      {/* Implement your component UI here using the props */}
      {title && <h2 className="text-xl font-bold mb-2">{title}</h2>}
      {description && <p className="text-gray-700 mb-4">{description}</p>}
      {ctaText && ctaLink && (
        <a 
          href={ctaLink} 
          className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          {ctaText}
        </a>
      )}
    </div>
  );
};\n\nexport default ${componentName};\n`;
        }
    }

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

/**
 * Format a component description using Anthropic API
 * @param {string} description - User's description to format
 * @returns {Promise<string>} - Formatted description
 */
async function formatDescription(description) {
    // Check if Anthropic API key is configured
    const config = vscode.workspace.getConfiguration('nextjsComponentGenerator');
    const apiKey = config.get('anthropicApiKey');

    if (!apiKey) {
        // Prompt user to enter API key if not configured
        const enteredKey = await vscode.window.showInputBox({
            prompt: 'Please enter your Anthropic API key',
            password: true,
            ignoreFocusOut: true,
            placeHolder: 'sk-ant-...'
        });

        if (!enteredKey) {
            throw new Error('Anthropic API key is required to format descriptions.');
        }

        // Save the API key in settings
        await config.update('anthropicApiKey', enteredKey, vscode.ConfigurationTarget.Global);
    }

    // Initialize Anthropic client
    const anthropic = new Anthropic({
        apiKey: apiKey || config.get('anthropicApiKey')
    });

    // Prepare the system prompt for formatting
    const systemPrompt = `You are a helpful assistant that formats component descriptions to be more detailed, structured, and clear. Your task is to take a user's brief description of a UI component and enhance it with specific details about:
    1. Layout and structure
    2. Responsive behavior
    3. Styling and visual elements
    4. Interactive elements and states
    5. Accessibility considerations

Format the description in a clear, concise way that would help a developer understand exactly what to build. Do not add implementation details or code, just focus on the requirements and design aspects. Keep your response focused only on the improved description without any explanations or additional commentary.`;

    // Call the Anthropic API
    const response = await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        system: systemPrompt,
        messages: [
            {
                role: 'user',
                content: `Format this component description to be more detailed and structured: "${description}"`
            }
        ],
        max_tokens: 1000,
        temperature: 0.7
    });

    return response.content[0].text.trim();
}

module.exports = {
    generateComponent,
    formatDescription,
    cleanupTempFiles
};
