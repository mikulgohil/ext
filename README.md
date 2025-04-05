# Next.js Component Generator

A VS Code extension that generates Next.js components using OpenAI's GPT-4 Vision model. This extension allows you to describe a component in natural language and optionally provide a reference image to guide the generation process.

![Next.js Component Generator](https://raw.githubusercontent.com/yourusername/nextjs-component-generator/main/screenshots/demo.png)

## Features

- **Text-Based Generation**: Describe the component you want in natural language
- **Image Reference Support**: Upload reference images to guide the component design
- **TypeScript & Tailwind CSS**: Generated components use TypeScript and Tailwind CSS
- **Interactive Chat Interface**: User-friendly interface within VS Code
- **Automatic File Creation**: Option to automatically create component files in your project
- **Detailed Comments**: Generated components include detailed comments explaining the code

## Requirements

- VS Code 1.80.0 or higher
- An OpenAI API key with access to GPT-4 Vision model

## Installation

1. Install the extension from the VS Code Marketplace
2. You'll be prompted to enter your OpenAI API key when you first use the extension

## Usage

1. Open the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type "Next.js Component Generator: Start Chat" and select it
3. In the chat interface:
   - Enter a description of the component you want to create
   - Optionally upload or drag & drop a reference image
   - Click "Generate Component"
4. Review the generated component
5. If satisfied, the component will be created in your project (if the option is checked)

## Example Prompts

Here are some example prompts you can use:

- "Create a responsive pricing card with a title, price, features list, and a call-to-action button. It should have a hover effect and support dark mode."
- "Build a navigation bar with a logo, links, and a mobile hamburger menu that expands on click."
- "Design a product showcase component with an image carousel, product details, and an 'Add to Cart' button."
- "Make a user profile card showing avatar, name, bio, and social media links with a modern design."

## Extension Settings

This extension contributes the following settings:

* `nextjsComponentGenerator.openaiApiKey`: Your OpenAI API key

## Known Issues

- The extension requires an internet connection to communicate with the OpenAI API
- Large or complex components may take longer to generate
- The extension works best with Next.js projects that use TypeScript and Tailwind CSS

## Release Notes

### 1.0.0

- Initial release of Next.js Component Generator
- Support for generating Next.js components using text descriptions
- Support for uploading reference images to guide component generation
- Integration with OpenAI's GPT-4 Vision model
- TypeScript and Tailwind CSS support for generated components
- Detailed comments in generated components explaining structure and functionality

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This extension is licensed under the [MIT License](LICENSE).
