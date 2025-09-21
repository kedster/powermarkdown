       // In-memory storage for the session
        let editorState = {
            content: '',
            currentFormat: null
        };

        // Simple error logging
        const errorLog = [];
        
        function logError(error, context) {
            const timestamp = new Date().toISOString();
            const logEntry = {
                timestamp,
                error: error.message || error,
                context,
                userAgent: navigator.userAgent.substring(0, 100) // Truncated for privacy
            };
            errorLog.push(logEntry);
            console.error('PowerMarkdown Error:', logEntry);
            
            // Keep only last 10 errors
            if (errorLog.length > 10) {
                errorLog.shift();
            }
        }

        // Global error handler
        window.addEventListener('error', function(event) {
            logError(event.error, 'Global error handler');
        });

        // Unhandled promise rejection handler
        window.addEventListener('unhandledrejection', function(event) {
            logError(event.reason, 'Unhandled promise rejection');
        });

        const editor = document.getElementById('editor');
        const preview = document.getElementById('preview');
        const stats = document.getElementById('stats');

        // Configure marked with syntax highlighting and security
        if (typeof marked !== 'undefined') {
            marked.setOptions({
                highlight: function(code, lang) {
                    if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
                        try {
                            return hljs.highlight(code, { language: lang }).value;
                        } catch (err) {
                            logError(err, 'Syntax highlighting error');
                        }
                    }
                    return typeof hljs !== 'undefined' ? hljs.highlightAuto(code).value : code;
                },
                breaks: true,
                gfm: true,
                sanitize: false, // We'll handle our own sanitization
                smartypants: false // Disable for security
            });
        } else {
            logError(new Error('marked.js not loaded'), 'Library loading');
        }

        // Simple HTML sanitization
        function sanitizeHTML(html) {
            // Create a temporary div to parse HTML
            const temp = document.createElement('div');
            temp.innerHTML = html;
            
            // Remove potentially dangerous tags
            const dangerousTags = ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'];
            dangerousTags.forEach(tag => {
                const elements = temp.querySelectorAll(tag);
                elements.forEach(el => el.remove());
            });
            
            // Remove dangerous attributes
            const allElements = temp.querySelectorAll('*');
            allElements.forEach(el => {
                // Remove event handlers and javascript: links
                Array.from(el.attributes).forEach(attr => {
                    if (attr.name.startsWith('on') || 
                        (attr.value && attr.value.toLowerCase().includes('javascript:'))) {
                        el.removeAttribute(attr.name);
                    }
                });
            });
            
            return temp.innerHTML;
        }

        // Real-time preview update
        editor.addEventListener('input', function() {
            try {
                const content = editor.value;
                editorState.content = content;
                updatePreview(content);
                updateStats(content);
            } catch (error) {
                logError(error, 'Editor input handler');
            }
        });

        function updatePreview(content) {
            try {
                if (typeof marked !== 'undefined') {
                    const rawHTML = marked.parse(content);
                    const sanitizedHTML = sanitizeHTML(rawHTML);
                    preview.innerHTML = sanitizedHTML;
                } else {
                    preview.innerHTML = '<p style="color: orange;">Loading markdown parser...</p>';
                }
            } catch (error) {
                logError(error, 'Preview update');
                preview.innerHTML = '<p style="color: red;">Error parsing markdown. Please check your syntax.</p>';
            }
        }

        function updateStats(content) {
            const words = content.trim() ? content.trim().split(/\s+/).length : 0;
            const chars = content.length;
            const lines = content.split('\n').length;
            stats.textContent = `Words: ${words} | Characters: ${chars} | Lines: ${lines}`;
        }

        function insertFormat(before, after, placeholder) {
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            const selectedText = editor.value.substring(start, end);
            const textToInsert = selectedText || placeholder;
            const newText = before + textToInsert + after;
            
            editor.value = editor.value.substring(0, start) + newText + editor.value.substring(end);
            editor.focus();
            
            if (!selectedText) {
                editor.setSelectionRange(start + before.length, start + before.length + placeholder.length);
            } else {
                editor.setSelectionRange(start + newText.length, start + newText.length);
            }
            
            editor.dispatchEvent(new Event('input'));
        }

        function autoFormat() {
            let content = editor.value;
            
            // Smart auto-formatting based on content analysis
            if (content.includes('function') || content.includes('const') || content.includes('class')) {
                content = formatAsCode(content);
            } else if (content.includes('step') || content.includes('tutorial')) {
                content = formatAsTutorial(content);
            } else {
                content = formatAsArticle(content);
            }
            
            editor.value = content;
            editor.dispatchEvent(new Event('input'));
        }

        function formatAsCode(content) {
            // Wrap code-like content in code blocks
            const lines = content.split('\n');
            let formatted = [];
            let inCodeBlock = false;
            
            for (let line of lines) {
                if (line.match(/^(function|const|let|var|class|import|export)/)) {
                    if (!inCodeBlock) {
                        formatted.push('```javascript');
                        inCodeBlock = true;
                    }
                    formatted.push(line);
                } else if (inCodeBlock && line.trim() === '') {
                    formatted.push(line);
                } else if (inCodeBlock) {
                    formatted.push('```');
                    formatted.push('');
                    formatted.push(line);
                    inCodeBlock = false;
                } else {
                    formatted.push(line);
                }
            }
            
            if (inCodeBlock) {
                formatted.push('```');
            }
            
            return formatted.join('\n');
        }

        function formatAsTutorial(content) {
            const lines = content.split('\n');
            let formatted = [];
            let stepCounter = 1;
            
            for (let line of lines) {
                if (line.toLowerCase().includes('step') && !line.startsWith('#')) {
                    formatted.push(`## Step ${stepCounter}: ${line.replace(/step\s*\d*:?\s*/i, '')}`);
                    stepCounter++;
                } else {
                    formatted.push(line);
                }
            }
            
            return formatted.join('\n');
        }

        function formatAsArticle(content) {
            const lines = content.split('\n');
            let formatted = [];
            
            for (let line of lines) {
                // Auto-detect headings
                if (line.length > 0 && !line.startsWith('#') && !line.startsWith('-') && !line.startsWith('*')) {
                    if (line.length < 60 && !line.includes('.') && !line.includes(',')) {
                        // Likely a heading
                        formatted.push(`## ${line}`);
                    } else {
                        formatted.push(line);
                    }
                } else {
                    formatted.push(line);
                }
            }
            
            return formatted.join('\n');
        }

        function optimizeForDevTo() {
            let content = editor.value;
            
            // Add dev.to specific formatting
            if (!content.includes('---')) {
                const frontMatter = `---
title: "Your Title Here"
published: false
description: "Brief description"
tags: [javascript, tutorial, webdev]
canonical_url: 
cover_image: 
---

`;
                content = frontMatter + content;
            }
            
            // Optimize code blocks for dev.to
            content = content.replace(/```(\w+)/g, '```$1');
            
            editor.value = content;
            editor.dispatchEvent(new Event('input'));
        }

        function optimizeForChatGPT() {
            let content = editor.value;
            
            // Format for clear ChatGPT communication
            const lines = content.split('\n');
            let formatted = [];
            
            for (let line of lines) {
                if (line.startsWith('Q:') || line.startsWith('Question:')) {
                    formatted.push(`**${line}**`);
                } else if (line.startsWith('A:') || line.startsWith('Answer:')) {
                    formatted.push(`**${line}**`);
                } else if (line.includes('please') || line.includes('can you')) {
                    formatted.push(`> ${line}`);
                } else {
                    formatted.push(line);
                }
            }
            
            editor.value = formatted.join('\n');
            editor.dispatchEvent(new Event('input'));
        }

        function applyFormat(element, format) {
            // Remove active class from all buttons
            document.querySelectorAll('.format-btn').forEach(btn => btn.classList.remove('active'));
            element.classList.add('active');
            
            editorState.currentFormat = format;
            
            const templates = {
                'dev-article': `# Your Article Title

Brief introduction to your topic...

## Introduction

Explain what you'll cover in this article.

## Main Content

### Subsection 1

Your content here...

\`\`\`javascript
// Code example
const example = "Hello World";
console.log(example);
\`\`\`

### Subsection 2

More content...

## Conclusion

Wrap up your thoughts...

---

Thanks for reading! Follow me for more content.`,

                'tutorial': `# Step-by-Step Tutorial: [Topic]

## Prerequisites

- Requirement 1
- Requirement 2
- Requirement 3

## Step 1: Setup

First, let's set up our environment...

\`\`\`bash
npm install package-name
\`\`\`

## Step 2: Configuration

Next, we'll configure...

## Step 3: Implementation

Now let's implement the solution...

## Step 4: Testing

Finally, let's test our implementation...

## Conclusion

You've successfully learned how to...`,

                'chatgpt-prompt': `**Context:** Provide clear context about what you need

**Task:** Clearly state what you want ChatGPT to do

**Requirements:**
- Specific requirement 1
- Specific requirement 2
- Output format needed

**Example:** If helpful, provide an example of what you're looking for

**Additional Notes:** Any extra context or constraints`,

                'readme': `# Project Name

Brief description of what this project does.

## Features

- Feature 1
- Feature 2
- Feature 3

## Installation

\`\`\`bash
npm install project-name
\`\`\`

## Usage

\`\`\`javascript
const project = require('project-name');
project.doSomething();
\`\`\`

## API Reference

### Method 1

Description of method...

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.`
            };
            
            if (templates[format]) {
                editor.value = templates[format];
                editor.dispatchEvent(new Event('input'));
            }
        }

        function toggleExportMenu() {
            try {
                const dropdown = document.getElementById('exportDropdown');
                const button = dropdown.previousElementSibling;
                const isOpen = dropdown.classList.contains('show');
                
                dropdown.classList.toggle('show');
                
                // Update ARIA attributes
                button.setAttribute('aria-expanded', !isOpen);
                dropdown.setAttribute('aria-hidden', isOpen);
                
                // Focus first menu item when opened
                if (!isOpen) {
                    const firstMenuItem = dropdown.querySelector('.export-option');
                    if (firstMenuItem) {
                        firstMenuItem.focus();
                    }
                }
            } catch (error) {
                logError(error, 'Toggle export menu');
            }
        }

        function exportMarkdown() {
            const content = editor.value;
            const blob = new Blob([content], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'document.md';
            a.click();
            URL.revokeObjectURL(url);
            toggleExportMenu();
        }

        function exportHTML() {
            const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Markdown Document</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
        code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
        pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
        blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 20px; color: #666; }
    </style>
</head>
<body>
${preview.innerHTML}
</body>
</html>`;
            
            const blob = new Blob([htmlContent], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'document.html';
            a.click();
            URL.revokeObjectURL(url);
            toggleExportMenu();
        }

        function copyToClipboard() {
            navigator.clipboard.writeText(editor.value).then(() => {
                alert('Markdown copied to clipboard!');
            });
            toggleExportMenu();
        }

        // Close export menu when clicking outside
        document.addEventListener('click', function(event) {
            const exportMenu = document.querySelector('.export-menu');
            if (!exportMenu.contains(event.target)) {
                document.getElementById('exportDropdown').classList.remove('show');
            }
        });

        // Initialize with default content
        const defaultContent = `# Welcome to PowerMarkdown! ⚡

This editor is specifically optimized for **dev.to** and **ChatGPT** formatting with intelligent auto-formatting capabilities.

## ✨ Key Features

- **Live Preview**: See your markdown rendered in real-time
- **Smart Auto-Format**: Automatically detects content type and formats accordingly
- **Platform Optimization**: One-click formatting for dev.to and ChatGPT
- **Export Options**: Save as Markdown, HTML, or copy to clipboard
- **Syntax Highlighting**: Code blocks with proper highlighting

## 🚀 Quick Start

1. Start typing in the editor
2. Use toolbar buttons for quick formatting
3. Try the **Auto Format** button to see intelligent formatting
4. Use **dev.to Style** for blog posts
5. Use **ChatGPT Style** for clear prompts

## 💡 Pro Tips

- The editor detects code and automatically wraps it in code blocks
- Tutorial content gets automatically numbered steps
- Articles get smart heading detection
- All formatting works great with dev.to and ChatGPT!

\`\`\`javascript
// Code example with syntax highlighting
const markdownSurgeon = {
    power: 'maximum',
    features: ['auto-format', 'live-preview', 'export'],
    optimizedFor: ['dev.to', 'ChatGPT']
};

console.log('Ready to create amazing content! 🎉');
\`\`\`

> Try the different formatting templates below to see the magic! ✨`;

        editor.value = defaultContent;
        updatePreview(defaultContent);
        updateStats(defaultContent);

        // Navigation Functions
        function scrollToSection(sectionId) {
            try {
                const element = document.getElementById(sectionId);
                if (element) {
                    element.scrollIntoView({ 
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            } catch (error) {
                logError(error, 'scrollToSection');
            }
        }

        function showHelp() {
            try {
                const helpContent = `
# PowerMarkdown Help 🚀

## Quick Start Guide

### 1. Basic Editing
- Type markdown directly in the editor
- See live preview on the right
- Use toolbar buttons for common formatting

### 2. Auto-Formatting
- Click **🪄 Auto Format** for intelligent formatting
- Use **📝 dev.to Style** for blog posts
- Use **🤖 ChatGPT Style** for clear prompts

### 3. Export Options
- **📝 Markdown (.md)**: Download as markdown file
- **🌐 HTML**: Export as styled HTML
- **📋 Copy to Clipboard**: Copy formatted text

### 4. Navigation
- Use header links to jump between sections
- Scroll smoothly with navigation menu
- All links are keyboard accessible

### 5. Smart Templates
Choose from format templates below:
- **📚 Dev Article**: For blog posts and articles
- **🎓 Tutorial**: Step-by-step guides
- **🤖 ChatGPT**: Structured prompts
- **📋 README**: Project documentation

## Keyboard Shortcuts
- **Ctrl/Cmd + S**: Export markdown
- **Ctrl/Cmd + C**: Copy to clipboard
- **Tab**: Navigate between elements

## Need More Help?
Visit our [GitHub repository](https://github.com/kedster/powermarkdown) for documentation, issues, and discussions.
`;
                const editor = document.getElementById('editor');
                if (editor) {
                    editor.value = helpContent;
                    editor.dispatchEvent(new Event('input'));
                    scrollToSection('editor');
                }
            } catch (error) {
                logError(error, 'showHelp');
                alert('Help content could not be loaded. Please visit our GitHub repository for documentation.');
            }
        }

        // Make functions globally available
        window.scrollToSection = scrollToSection;
        window.showHelp = showHelp;