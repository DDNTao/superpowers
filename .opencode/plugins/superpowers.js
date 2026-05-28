/**
 * Superpowers plugin for OpenCode.ai
 *
 * Injects superpowers bootstrap context via system prompt transform.
 * Auto-registers skills directory via config hook (no symlinks needed).
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath, pathToFileURL } from 'url';
import { saveSuperpowersArtifact } from '../../scripts/save-superpowers-artifact.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Simple frontmatter extraction (avoid dependency on skills-core for bootstrap)
const extractAndStripFrontmatter = (content) => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, content };

  const frontmatterStr = match[1];
  const body = match[2];
  const frontmatter = {};

  for (const line of frontmatterStr.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
      frontmatter[key] = value;
    }
  }

  return { frontmatter, content: body };
};

// Normalize a path: trim whitespace, expand ~, resolve to absolute
const normalizePath = (p, homeDir) => {
  if (!p || typeof p !== 'string') return null;
  let normalized = p.trim();
  if (!normalized) return null;
  if (normalized.startsWith('~/')) {
    normalized = path.join(homeDir, normalized.slice(2));
  } else if (normalized === '~') {
    normalized = homeDir;
  }
  return path.resolve(normalized);
};

const getOpenCodeToolHelper = async (configDir) => {
  try {
    return await import('@opencode-ai/plugin');
  } catch {
    const localToolHelper = path.join(configDir, 'node_modules', '@opencode-ai', 'plugin', 'dist', 'tool.js');
    if (fs.existsSync(localToolHelper)) {
      return import(pathToFileURL(localToolHelper).href);
    }
  }

  const describe = (schema) => ({
    ...schema,
    describe(description) {
      return { ...schema, description };
    },
  });

  return {
    tool: Object.assign((definition) => definition, {
      schema: {
        string: () => describe({ type: 'string' }),
        enum: (values) => describe({ type: 'string', enum: values }),
      },
    }),
  };
};

export const SuperpowersPlugin = async ({ client, directory } = {}) => {
  const homeDir = os.homedir();
  const superpowersSkillsDir = path.resolve(__dirname, '../../skills');
  const envConfigDir = normalizePath(process.env.OPENCODE_CONFIG_DIR, homeDir);
  const configDir = envConfigDir || path.join(homeDir, '.config/opencode');
  const { tool } = await getOpenCodeToolHelper(configDir);

  // Helper to generate bootstrap content
  const getBootstrapContent = () => {
    // Try to load using-superpowers skill
    const skillPath = path.join(superpowersSkillsDir, 'using-superpowers', 'SKILL.md');
    if (!fs.existsSync(skillPath)) return null;

    const fullContent = fs.readFileSync(skillPath, 'utf8');
    const { content } = extractAndStripFrontmatter(fullContent);

    const toolMapping = `**Tool Mapping for OpenCode:**
When skills reference tools you don't have, substitute OpenCode equivalents:
- \`TodoWrite\` → \`todowrite\`
- \`Task\` tool with subagents → Use OpenCode's subagent system (@mention)
- \`Skill\` tool → OpenCode's native \`skill\` tool
- \`Read\`, \`Write\`, \`Edit\`, \`Bash\` → Your native tools
- Plan Mode Superpowers artifacts → Use \`save_superpowers_artifact\` for approved specs and plans

Use OpenCode's native \`skill\` tool to list and load skills.`;

    return `<EXTREMELY_IMPORTANT>
You have superpowers.

**IMPORTANT: The using-superpowers skill content is included below. It is ALREADY LOADED - you are currently following it. Do NOT use the skill tool to load "using-superpowers" again - that would be redundant.**

${content}

${toolMapping}
</EXTREMELY_IMPORTANT>`;
  };

  return {
    // Inject skills path into live config so OpenCode discovers superpowers skills
    // without requiring manual symlinks or config file edits.
    // This works because Config.get() returns a cached singleton — modifications
    // here are visible when skills are lazily discovered later.
    config: async (config) => {
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      if (!config.skills.paths.includes(superpowersSkillsDir)) {
        config.skills.paths.push(superpowersSkillsDir);
      }
    },

    tool: {
      save_superpowers_artifact: tool({
        description:
          'Save an approved Superpowers brainstorming spec or writing-plans plan during Plan Mode. This tool only writes Markdown artifacts under docs/superpowers/specs or docs/superpowers/plans in the current project.',
        args: {
          kind: tool.schema.enum(['spec', 'plan']).describe('Artifact type to save. Use spec for brainstorming design docs and plan for implementation plans.'),
          slug: tool.schema.string().describe('Lowercase hyphenated artifact name, without date or extension.'),
          content: tool.schema.string().describe('Complete Markdown content to write to the Superpowers artifact file.'),
        },
        async execute(args, context) {
          const projectDir = context?.worktree || context?.directory || directory;
          const result = await saveSuperpowersArtifact({
            kind: args.kind,
            slug: args.slug,
            content: args.content,
            projectDir,
          });
          context?.metadata?.({
            title: `Saved ${args.kind}: ${result.relativePath}`,
            metadata: result,
          });
          return `Saved ${args.kind} artifact to ${result.relativePath}`;
        },
      }),
    },

    // Inject bootstrap into the first user message of each session.
    // Using a user message instead of a system message avoids:
    //   1. Token bloat from system messages repeated every turn (#750)
    //   2. Multiple system messages breaking Qwen and other models (#894)
    'experimental.chat.messages.transform': async (_input, output) => {
      const bootstrap = getBootstrapContent();
      if (!bootstrap || !output.messages.length) return;
      const firstUser = output.messages.find(m => m.info.role === 'user');
      if (!firstUser || !firstUser.parts.length) return;
      // Only inject once
      if (firstUser.parts.some(p => p.type === 'text' && p.text.includes('EXTREMELY_IMPORTANT'))) return;
      const ref = firstUser.parts[0];
      firstUser.parts.unshift({ ...ref, type: 'text', text: bootstrap });
    }
  };
};
