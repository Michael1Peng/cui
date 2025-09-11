import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createLogger } from './logger.js';

export interface Command {
  name: string;
  type: 'builtin' | 'custom';
  description?: string;
}

const logger = createLogger('CommandsService');

/**
 * Get hardcoded builtin commands
 */
export function getBuiltinCommands(): Command[] {
  return [
    { name: '/add-dir', type: 'builtin', description: 'Add a new working directory' },
    { name: '/clear', type: 'builtin', description: 'Clear conversation history and free up context' },
    { name: '/compact', type: 'builtin', description: 'Clear conversation history but keep a summary in context' },
    { name: '/init', type: 'builtin', description: 'Initialize a new CLAUDE.md file with codebase documentation' },
    { name: '/model', type: 'builtin', description: 'Set the AI model for Claude Code' },
    { name: '/permissions', type: 'builtin', description: 'Manage allow & deny tool permission rules' }
  ];
}

/**
 * Recursively scan directory for .md files and return command entries
 */
function scanCommandsRecursive(baseDir: string, currentDir: string = ''): Command[] {
  const commands: Command[] = [];
  const fullPath = path.join(baseDir, currentDir);
  
  try {
    if (!fs.existsSync(fullPath)) {
      return commands;
    }
    
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        const subCommands = scanCommandsRecursive(baseDir, entryPath);
        commands.push(...subCommands);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Convert file path to command name
        // Remove .md extension and prepend with /
        const commandPath = entryPath.slice(0, -3); // Remove .md
        const commandName = '/' + commandPath.replace(/\\/g, '/'); // Normalize path separators
        commands.push({ name: commandName, type: 'custom' });
      }
    }
  } catch (error) {
    logger.warn('Failed to scan commands directory recursively', {
      error: error instanceof Error ? error.message : String(error),
      path: fullPath
    });
  }
  
  return commands;
}

/**
 * Get custom commands from .claude/commands/ directories
 */
export function getCustomCommands(workingDirectory?: string): Command[] {
  const commands: Map<string, Command> = new Map();
  
  // Always check global directory
  const globalDir = path.join(os.homedir(), '.claude', 'commands');
  try {
    const globalCommands = scanCommandsRecursive(globalDir);
    for (const command of globalCommands) {
      commands.set(command.name, command);
    }
  } catch (error) {
    logger.warn('Failed to read global commands directory', { 
      error: error instanceof Error ? error.message : String(error),
      path: globalDir 
    });
  }
  
  // Check local directory if provided
  if (workingDirectory) {
    const localDir = path.join(workingDirectory, '.claude', 'commands');
    try {
      const localCommands = scanCommandsRecursive(localDir);
      for (const command of localCommands) {
        // Local commands override global ones
        commands.set(command.name, command);
      }
    } catch (error) {
      logger.warn('Failed to read local commands directory', { 
        error: error instanceof Error ? error.message : String(error),
        path: localDir 
      });
    }
  }
  
  return Array.from(commands.values());
}

/**
 * Get all available commands (builtin + custom)
 */
export function getAvailableCommands(workingDirectory?: string): Command[] {
  const builtin = getBuiltinCommands();
  const custom = getCustomCommands(workingDirectory);
  
  // Merge arrays
  return [...builtin, ...custom];
}